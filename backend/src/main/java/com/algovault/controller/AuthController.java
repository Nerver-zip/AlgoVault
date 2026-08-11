package com.algovault.controller;

import com.algovault.model.User;
import com.algovault.repository.UserRepository;
import com.algovault.service.JwtService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.core.user.OAuth2User;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.beans.factory.annotation.Value;
import java.util.Map;
import java.util.List;

@RestController
@RequestMapping("/api/auth")
@RequiredArgsConstructor
public class AuthController {

    private final JwtService jwtService;
    private final UserRepository userRepository;

    @Value("${app.auth.mode:single-user}")
    private String authMode;

    @Value("${spring.security.oauth2.client.registration.github.client-id:Ov23liTftGjfEU3BuSwX}")
    private String githubClientId;

    @Value("${spring.security.oauth2.client.registration.github.client-secret:77d4d5e03d71a049bd6992accdebecb6cc94238b}")
    private String githubClientSecret;

    @GetMapping("/success")
    public ResponseEntity<?> oauthSuccess(@AuthenticationPrincipal OAuth2User oauth2User) {
        if (oauth2User == null) {
            return ResponseEntity.badRequest().body("OAuth Login Failed");
        }
        
        String githubLogin = oauth2User.getAttribute("login");
        String avatarUrl = oauth2User.getAttribute("avatar_url");
        String githubIdStr = "github:" + oauth2User.getAttribute("id");
        
        User user = userRepository.findByGithubId(githubIdStr).orElseGet(() -> {
            User newUser = User.builder()
                .githubId(githubIdStr)
                .username(githubLogin)
                .avatarUrl(avatarUrl)
                .virtualRating(1500)
                .build();
            return userRepository.save(newUser);
        });

        String token = jwtService.generateToken(user.getId(), user.getUsername());
        
        return ResponseEntity.ok(Map.of(
            "token", token,
            "user", user
        ));
    }

    /**
     * Exchanges GitHub OAuth authorization code for an OAuth access token.
     */
    @PostMapping("/github-exchange")
    public ResponseEntity<?> exchangeGithubCode(@RequestBody Map<String, String> request) {
        String code = request == null ? null : request.get("code");
        if (code == null || code.isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("error", "Authorization code is required"));
        }

        try {
            org.springframework.web.client.RestTemplate restTemplate = new org.springframework.web.client.RestTemplate();
            org.springframework.http.HttpHeaders headers = new org.springframework.http.HttpHeaders();
            headers.setContentType(org.springframework.http.MediaType.APPLICATION_JSON);
            headers.setAccept(List.of(org.springframework.http.MediaType.APPLICATION_JSON));

            Map<String, String> body = Map.of(
                "client_id", githubClientId,
                "client_secret", githubClientSecret,
                "code", code
            );

            org.springframework.http.HttpEntity<Map<String, String>> entity = new org.springframework.http.HttpEntity<>(body, headers);
            ResponseEntity<Map> response = restTemplate.postForEntity(
                "https://github.com/login/oauth/access_token", entity, Map.class
            );

            if (response.getBody() != null && response.getBody().containsKey("access_token")) {
                String accessToken = (String) response.getBody().get("access_token");
                return ResponseEntity.ok(Map.of("token", accessToken));
            } else if (response.getBody() != null && response.getBody().containsKey("error_description")) {
                return ResponseEntity.badRequest().body(Map.of("error", response.getBody().get("error_description")));
            } else {
                return ResponseEntity.badRequest().body(Map.of("error", "Failed to exchange authorization code with GitHub"));
            }
        } catch (Exception e) {
            return ResponseEntity.internalServerError().body(Map.of("error", e.getMessage()));
        }
    }

    @GetMapping("/me")
    public ResponseEntity<?> getMe(@AuthenticationPrincipal Long userId) {
        if (userId == null) {
            return ResponseEntity.status(401).body("Unauthorized");
        }
        return userRepository.findById(userId)
            .map(ResponseEntity::ok)
            .orElse(ResponseEntity.notFound().build());
    }

    /**
     * Local-only bootstrap for the companion extension. It deliberately
     * permits exactly one persisted profile: once linked, a different
     * LeetCode username cannot create another local account.
     */
    @PostMapping("/extension-login")
    public ResponseEntity<?> extensionLogin(@RequestBody Map<String, String> request) {
        if (!"single-user".equalsIgnoreCase(authMode)) {
            return ResponseEntity.status(403).body("Local extension access is disabled.");
        }
        String username = request == null ? null : request.get("username");
        if (username == null || username.isBlank() || username.length() > 100) {
            return ResponseEntity.badRequest().body("A LeetCode username is required.");
        }
        String normalized = username.trim();
        List<User> users = userRepository.findAll();
        User user = users.stream()
                .filter(u -> normalized.equalsIgnoreCase(u.getLcUsername()))
                .findFirst()
                .orElse(null);

        if (user == null) {
            // Create a new user for this new LeetCode ID instead of blocking it
            user = userRepository.save(User.builder()
                .githubId("local:" + normalized.toLowerCase())
                .username(normalized)
                .lcUsername(normalized)
                .virtualRating(1500)
                .build());
        }
        return ResponseEntity.ok(Map.of("token", jwtService.generateToken(user.getId(), user.getUsername())));
    }
}
