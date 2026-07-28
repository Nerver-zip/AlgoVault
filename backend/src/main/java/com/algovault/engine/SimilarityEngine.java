package com.algovault.engine;

import com.algovault.model.Problem;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.stream.Collectors;

/**
 * Problem similarity engine using Gaussian rating proximity and difficulty matching.
 *
 * <h3>Scoring Function</h3>
 * <p>Each candidate problem is scored against a target problem using three signals:</p>
 * <ol>
 *   <li><b>Tag overlap</b> (weight 0.55): Jaccard similarity = |intersection| / |union|.
 *       A score of 1.0 means identical tag sets; 0.0 means no overlap.</li>
 *   <li><b>Rating proximity</b> (weight 0.35): Gaussian kernel with σ = 150:
 *       <pre>exp(−0.5 × (Δr / 150)²)</pre>
 *       This gives: Δr=50 → 0.95, Δr=150 → 0.61, Δr=300 → 0.14.</li>
 *   <li><b>Difficulty match</b> (weight 0.10): Binary bonus — 1.0 if both problems
 *       share the same difficulty string (Easy/Medium/Hard), 0.0 otherwise.</li>
 * </ol>
 *
 * <p>Final score = 0.55 × tagOverlap + 0.35 × ratingProximity + 0.10 × difficultyMatch</p>
 */
@Component
public class SimilarityEngine {

    private static final double TAG_WEIGHT = 0.55;
    private static final double RATING_WEIGHT = 0.35;
    private static final double DIFFICULTY_WEIGHT = 0.10;
    private static final double RATING_SIGMA = 150.0;

    public List<Problem> findSimilar(Problem target, List<Problem> solvedProblems, int limit) {
        if (target.getTags() == null || target.getTags().isEmpty()) {
            return solvedProblems.stream().limit(limit).collect(Collectors.toList());
        }

        return solvedProblems.stream()
            .filter(p -> p.getActualRating() != null && target.getActualRating() != null)
            .sorted((p1, p2) -> {
                double score1 = calculateSimilarity(target, p1);
                double score2 = calculateSimilarity(target, p2);
                return Double.compare(score2, score1);
            })
            .limit(limit)
            .collect(Collectors.toList());
    }

    private double calculateSimilarity(Problem target, Problem candidate) {
        // ─── Tag overlap (Jaccard similarity) ────────────────────────────
        double tagOverlap = 0.0;
        if (target.getTags() != null && candidate.getTags() != null) {
            long intersectionCount = target.getTags().stream()
                    .filter(candidate.getTags()::contains)
                    .count();
            if (intersectionCount > 0) {
                long unionCount = target.getTags().size() + candidate.getTags().size() - intersectionCount;
                tagOverlap = (double) intersectionCount / unionCount;
            }
        }

        // ─── Rating proximity (Gaussian kernel) ──────────────────────────
        double ratingProximity = 0.0;
        if (target.getActualRating() != null && candidate.getActualRating() != null) {
            double ratingDiff = Math.abs(target.getActualRating() - candidate.getActualRating());
            ratingProximity = Math.exp(-0.5 * Math.pow(ratingDiff / RATING_SIGMA, 2));
        }

        // ─── Difficulty match (binary bonus) ─────────────────────────────
        double difficultyMatch = 0.0;
        if (target.getDifficulty() != null && candidate.getDifficulty() != null
                && target.getDifficulty().equalsIgnoreCase(candidate.getDifficulty())) {
            difficultyMatch = 1.0;
        }

        return TAG_WEIGHT * tagOverlap + RATING_WEIGHT * ratingProximity + DIFFICULTY_WEIGHT * difficultyMatch;
    }
}
