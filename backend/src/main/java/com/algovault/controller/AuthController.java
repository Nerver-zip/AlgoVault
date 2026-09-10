package com.algovault.controller;

import com.algovault.model.User;
import com.algovault.repository.UserRepository;
import com.algovault.service.JwtService;
import com.algovault.service.OAuthStateService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.client.HttpStatusCodeException;
import org.springframework.web.client.RestClientException;

import java.util.List;
import java.util.Map;

/**
 * OAuth is the only production account-creation path. A LeetCode username is
 * public information, so it is deliberately never accepted as authentication.
 */
@RestController
@RequestMapping("/api/auth")
@RequiredArgsConstructor
public class AuthController {
    private final JwtService jwtService;
    private final UserRepository userRepository;
    private final OAuthStateService oauthStateService;
    private final RestTemplate restTemplate;

    @Value("${github.oauth.client-id}")
    private String githubClientId;

    @Value("${github.oauth.client-secret}")
    private String githubClientSecret;

    @jakarta.annotation.PostConstruct
    void validateOAuthConfiguration() {
        if (githubClientId == null || githubClientId.isBlank() || githubClientSecret == null || githubClientSecret.isBlank()) {
            throw new IllegalStateException("GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET must be configured");
        }
    }

    public record OAuthStateResponse(String state) {}
    public record GithubExchangeRequest(
        @NotBlank @Size(max = 300) String code,
        @NotBlank @Pattern(regexp = "^[A-Za-z0-9_-]{43}$") String state,
        @NotBlank @Pattern(regexp = "^[A-Za-z0-9._~-]{43,128}$") String codeVerifier,
        @NotBlank @Pattern(regexp = "^https://[a-p]{32}\\.chromiumapp\\.org/$") String redirectUri
    ) {}
    public record GithubTokenRequest(@NotBlank @Size(max = 500) String token) {}
    public record GithubRefreshRequest(@NotBlank @Size(max = 500) String refreshToken) {}
    public record GithubExchangeResponse(
        String token,
        String githubToken,
        String username,
        String refreshToken,
        Long expiresIn,
        Long refreshTokenExpiresIn
    ) {}

    @GetMapping("/github-state")
    public ResponseEntity<OAuthStateResponse> githubState() {
        return ResponseEntity.ok(new OAuthStateResponse(oauthStateService.issue()));
    }

    @PostMapping("/github-exchange")
    public ResponseEntity<?> exchangeGithubCode(@Valid @RequestBody GithubExchangeRequest request) {
        if (!oauthStateService.consume(request.state())) {
            return ResponseEntity.badRequest().body(Map.of("error", "Invalid or expired OAuth state"));
        }
        try {
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            headers.setAccept(List.of(MediaType.APPLICATION_JSON));
            ResponseEntity<Map> tokenResponse = restTemplate.postForEntity(
                "https://github.com/login/oauth/access_token",
                new org.springframework.http.HttpEntity<>(Map.of(
                    "client_id", githubClientId,
                    "client_secret", githubClientSecret,
                    "code", request.code(),
                    "code_verifier", request.codeVerifier(),
                    "redirect_uri", request.redirectUri()
                ), headers),
                Map.class
            );
            String githubToken = tokenResponse.getBody() == null ? null : (String) tokenResponse.getBody().get("access_token");
            if (githubToken == null || githubToken.isBlank()) {
                return ResponseEntity.status(401).body(Map.of("error", "GitHub did not grant an access token"));
            }

            return ResponseEntity.ok(authenticateGithubToken(githubToken, tokenResponse.getBody()));
        } catch (Exception exception) {
            return ResponseEntity.status(401).body(Map.of("error", "GitHub authorization could not be verified"));
        }
    }

    /**
     * Optional path for a user-created, fine-grained PAT. The token is used
     * once to verify the GitHub identity and is never written to our database.
     */
    @PostMapping("/github-token")
    public ResponseEntity<?> authenticateGithubToken(@Valid @RequestBody GithubTokenRequest request) {
        try {
            return ResponseEntity.ok(authenticateGithubToken(request.token()));
        } catch (Exception exception) {
            return ResponseEntity.status(401).body(Map.of("error", "GitHub token could not be verified"));
        }
    }

    /**
     * Rotate an expiring GitHub OAuth access token without exposing the OAuth
     * client secret to the extension. GitHub rotates both values, so the
     * caller must persist the refresh token returned in the response.
     */
    @PostMapping("/github-refresh")
    public ResponseEntity<?> refreshGithubToken(@Valid @RequestBody GithubRefreshRequest request) {
        try {
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            headers.setAccept(List.of(MediaType.APPLICATION_JSON));
            ResponseEntity<Map> tokenResponse = restTemplate.postForEntity(
                "https://github.com/login/oauth/access_token",
                new org.springframework.http.HttpEntity<>(Map.of(
                    "client_id", githubClientId,
                    "client_secret", githubClientSecret,
                    "grant_type", "refresh_token",
                    "refresh_token", request.refreshToken()
                ), headers),
                Map.class
            );
            Map body = tokenResponse.getBody();
            String githubToken = body == null ? null : (String) body.get("access_token");
            if (githubToken == null || githubToken.isBlank()) {
                return ResponseEntity.status(401).body(Map.of("error", "GitHub refresh token is invalid or expired"));
            }
            return ResponseEntity.ok(authenticateGithubToken(githubToken, body));
        } catch (HttpStatusCodeException exception) {
            if (exception.getStatusCode().is4xxClientError()) {
                return ResponseEntity.status(401).body(Map.of("error", "GitHub refresh token is invalid or expired"));
            }
            return ResponseEntity.status(503).body(Map.of("error", "GitHub token service is temporarily unavailable"));
        } catch (RestClientException exception) {
            return ResponseEntity.status(503).body(Map.of("error", "GitHub token service is temporarily unavailable"));
        } catch (Exception exception) {
            return ResponseEntity.status(401).body(Map.of("error", "GitHub refresh token could not be verified"));
        }
    }

    private GithubExchangeResponse authenticateGithubToken(String githubToken) {
        return authenticateGithubToken(githubToken, null);
    }

    private GithubExchangeResponse authenticateGithubToken(String githubToken, Map tokenResponse) {
        HttpHeaders githubHeaders = new HttpHeaders();
        githubHeaders.setBearerAuth(githubToken);
        githubHeaders.setAccept(List.of(MediaType.valueOf("application/vnd.github+json")));
        ResponseEntity<Map> profileResponse = restTemplate.exchange(
            "https://api.github.com/user", org.springframework.http.HttpMethod.GET,
            new org.springframework.http.HttpEntity<>(githubHeaders), Map.class
        );
        Map profile = profileResponse.getBody();
        Object rawId = profile == null ? null : profile.get("id");
        String login = profile == null ? null : (String) profile.get("login");
        if (rawId == null || login == null || login.isBlank()) {
            throw new IllegalArgumentException("Could not verify GitHub identity");
        }
        String githubId = "github:" + rawId;
        String avatarUrl = profile.get("avatar_url") instanceof String avatar ? avatar : null;
        User user = userRepository.findByGithubId(githubId).orElseGet(() -> userRepository.save(User.builder()
            .githubId(githubId).username(login).avatarUrl(avatarUrl).virtualRating(1500).build()));
        return new GithubExchangeResponse(
            jwtService.generateToken(user.getId(), user.getUsername()),
            githubToken,
            user.getUsername(),
            tokenResponse == null ? null : stringValue(tokenResponse.get("refresh_token")),
            tokenResponse == null ? null : longValue(tokenResponse.get("expires_in")),
            tokenResponse == null ? null : longValue(tokenResponse.get("refresh_token_expires_in"))
        );
    }

    private static String stringValue(Object value) {
        return value instanceof String text && !text.isBlank() ? text : null;
    }

    private static Long longValue(Object value) {
        if (value instanceof Number number) return number.longValue();
        if (value instanceof String text) {
            try {
                return Long.parseLong(text);
            } catch (NumberFormatException ignored) {
                return null;
            }
        }
        return null;
    }

    @GetMapping("/me")
    public ResponseEntity<?> getMe(@org.springframework.security.core.annotation.AuthenticationPrincipal Long userId) {
        if (userId == null) return ResponseEntity.status(401).build();
        return userRepository.findById(userId).map(ResponseEntity::ok).orElse(ResponseEntity.notFound().build());
    }

    @PostMapping("/logout")
    public ResponseEntity<Void> logout(@RequestHeader(HttpHeaders.AUTHORIZATION) String authorization) {
        if (authorization == null || !authorization.startsWith("Bearer ")) {
            return ResponseEntity.status(401).build();
        }
        jwtService.revokeToken(authorization.substring(7));
        return ResponseEntity.noContent().build();
    }
}
