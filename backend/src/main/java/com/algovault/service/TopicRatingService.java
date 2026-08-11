package com.algovault.service;

import com.algovault.engine.Glicko2MasteryEngine;
import com.algovault.engine.Glicko2MasteryEngine.GlickoRating;
import com.algovault.engine.Glicko2MasteryEngine.MatchResult;
import com.algovault.model.Submission;
import com.algovault.model.TopicRating;
import com.algovault.model.User;
import com.algovault.repository.SubmissionRepository;
import com.algovault.repository.TopicRatingRepository;
import com.algovault.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.*;

@Service
@org.springframework.transaction.annotation.Transactional
@RequiredArgsConstructor
@Slf4j
public class TopicRatingService {

    private final SubmissionRepository submissionRepository;
    private final TopicRatingRepository topicRatingRepository;
    private final UserRepository userRepository;
    private final Glicko2MasteryEngine glickoEngine;

    @Transactional
    public void recomputeElo(Long userId) {
        log.info("Recomputing Glicko-2 Topic Ratings for user {}", userId);
        User user = userRepository.findById(userId).orElseThrow();

        List<Submission> allSubs = submissionRepository.findByUserId(userId);
        allSubs.sort(Comparator.comparing(Submission::getSubmittedAt));

        // Gather all distinct topic tags
        Set<String> allTags = new HashSet<>();
        for (Submission sub : allSubs) {
            if (sub.getProblem() != null && sub.getProblem().getTags() != null) {
                allTags.addAll(sub.getProblem().getTags());
            }
        }

        for (String tag : allTags) {
            recomputeEloForTag(user, tag);
        }
    }

    @Transactional
    public void updateIncremental(Long userId, Submission submission) {
        if (submission.getProblem() == null || submission.getProblem().getTags() == null) return;
        List<String> tags = submission.getProblem().getTags();
        if (tags.isEmpty()) return;

        User user = userRepository.findById(userId).orElseThrow();
        for (String tag : tags) {
            recomputeEloForTag(user, tag);
        }
    }

    @Transactional
    public void recomputeEloForTag(User user, String tag) {
        List<Submission> tagSubs = submissionRepository.findByUserIdAndTag(user.getId(), tag);
        if (tagSubs.isEmpty()) return;

        tagSubs.sort(Comparator.comparing(Submission::getSubmittedAt));

        Map<Long, List<Submission>> problemAttemptsMap = new LinkedHashMap<>();
        for (Submission sub : tagSubs) {
            if (sub.getProblem() != null) {
                problemAttemptsMap.computeIfAbsent(sub.getProblem().getId(), k -> new ArrayList<>()).add(sub);
            }
        }

        GlickoRating gRating = new GlickoRating(1500.0, 350.0, 0.06);
        int problemsPlayed = 0;
        int maxRating = 1500;
        LocalDateTime lastPracticedAt = null;

        for (List<Submission> subs : problemAttemptsMap.values()) {
            if (subs.isEmpty()) continue;
            Submission firstSub = subs.get(0);
            Double rawProblemRating = firstSub.getProblem().getActualRating();
            double problemRating = (rawProblemRating != null && rawProblemRating > 0) ? rawProblemRating : 1200.0;

            boolean isFirstTryAc = "Accepted".equals(firstSub.getVerdict());
            boolean isEventualAc = subs.stream().anyMatch(s -> "Accepted".equals(s.getVerdict()));
            double score = isFirstTryAc ? 1.0 : (isEventualAc ? 0.7 : 0.0);

            // Match opponent RD is assumed 50.0 for stable ZeroTrac problem ratings
            MatchResult match = new MatchResult(problemRating, 50.0, score);
            gRating = glickoEngine.updateRating(gRating, List.of(match));

            problemsPlayed++;
            int currentRoundRating = (int) Math.round(gRating.rating);
            if (currentRoundRating > maxRating) {
                maxRating = currentRoundRating;
            }
            if (firstSub.getSubmittedAt() != null) {
                lastPracticedAt = firstSub.getSubmittedAt();
            }
        }

        if (problemsPlayed == 0) return;

        // Apply inactivity time decay if unpracticed for over 7 days
        if (lastPracticedAt != null) {
            long daysInactive = java.time.Duration.between(lastPracticedAt, LocalDateTime.now()).toDays();
            if (daysInactive >= 7) {
                double weeksInactive = daysInactive / 7.0;
                double phi = gRating.rd / 173.7178;
                double phiPrime = Math.sqrt(phi * phi + weeksInactive * gRating.volatility * gRating.volatility);
                gRating.rd = Math.min(phiPrime * 173.7178, 350.0);
            }
        }

        TopicRating tr = topicRatingRepository.findByUserIdAndTag(user.getId(), tag)
                .orElseGet(() -> TopicRating.builder().user(user).tag(tag).build());

        int finalRating = (int) Math.round(gRating.rating);
        tr.setEloRating(finalRating);
        tr.setRd(gRating.rd);
        tr.setVolatility(gRating.volatility);
        int conservative = Math.max(800, (int) Math.round(gRating.rating - 1.96 * gRating.rd));
        tr.setConservativeRating(conservative);

        Integer prevPeak = tr.getPeakRating();
        tr.setPeakRating(prevPeak == null ? maxRating : Math.max(prevPeak, maxRating));
        tr.setProblemsPlayed(problemsPlayed);
        tr.setLastPracticedAt(lastPracticedAt);

        topicRatingRepository.save(tr);
    }
}
