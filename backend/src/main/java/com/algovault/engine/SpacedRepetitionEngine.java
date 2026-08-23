package com.algovault.engine;

import com.algovault.model.RevisionCard;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;

/**
 * FSRS-4.5 (Free Spaced Repetition Scheduler) engine.
 *
 * <p>Replaces the legacy SM-2 algorithm with the FSRS model published by
 * Ye (2023), which powers modern Anki (v23+). Key improvements:</p>
 * <ul>
 *   <li><b>Power-law forgetting curve</b> instead of fixed-interval multiplication.
 *       Interval = S × (9 × (1/R − 1))^(1/DECAY) where S = stability, R = desired retention.</li>
 *   <li><b>Difficulty model</b>: difficulty D evolves with each review based on grade,
 *       preventing the "ease hell" problem of SM-2.</li>
 *   <li><b>Desired retention target</b>: configurable R (default 0.9) that the algorithm
 *       optimizes intervals toward.</li>
 * </ul>
 *
 * <p>The 19 pretrained weights are from the FSRS-4.5 paper's default parameters,
 * calibrated on millions of Anki review logs.</p>
 */
@Component
public class SpacedRepetitionEngine {

    // FSRS-4.5 default weights (w0..w18) from the paper's universal defaults.
    // These can be personalized per-user with enough review data, but the
    // defaults are well-calibrated for general use.
    private static final double[] W = {
        0.4072,  // w0:  initial stability for Again
        1.1829,  // w1:  initial stability for Hard
        3.1262,  // w2:  initial stability for Good
        15.4722, // w3:  initial stability for Easy
        7.2102,  // w4:  difficulty weight
        0.5316,  // w5:  stability after success
        1.0651,  // w6:  stability multiplier
        0.0046,  // w7:  stability penalty for difficulty
        1.5418,  // w8:  stability recovery factor
        0.1576,  // w9:  stability decay
        1.0100,  // w10: stability after failure (recall)
        2.0467,  // w11: failure stability factor
        0.0086,  // w12: failure difficulty penalty
        0.3481,  // w13: failure stability decay
        0.2231,  // w14: hard penalty (< 1.0)
        1.3559,  // w15: easy bonus (> 1.0)
        0.0280,  // w16: mean reversion strength
        2.9282,  // w17: DECAY exponent for interval calculation
        0.4403   // w18: short-term stability factor
    };

    /** Target retention rate — 90% is the researched optimal for long-term learning. */
    private static final double DESIRED_RETENTION = 0.9;

    /** FSRS DECAY constant: -w17. */
    private static final double DECAY = -W[17];

    /**
     * FSRS FACTOR constant derived so that R(S, S) = DESIRED_RETENTION (0.90) exactly:
     * R(t, S) = (1 + FACTOR * (t / S))^(-w17)
     * Solving for R(S, S) = DESIRED_RETENTION:
     * (1 + FACTOR)^(-w17) = DESIRED_RETENTION  =>  FACTOR = DESIRED_RETENTION^(-1.0 / w17) - 1.0
     */
    public static final double FACTOR = Math.pow(DESIRED_RETENTION, -1.0 / W[17]) - 1.0;

    /**
     * Updates a revision card after a review.
     *
     * @param card               the card being reviewed
     * @param quality            user's self-assessed quality (0-5 scale, mapped to FSRS grades)
     * @param weaknessMultiplier topic weakness modifier (0.6-1.0; lower = review sooner)
     * @param wasContestFailure  whether this problem was failed in a real contest (halves interval)
     * @return the updated card
     */
    public RevisionCard updateCard(RevisionCard card, int quality, double weaknessMultiplier, boolean wasContestFailure) {
        quality = Math.max(0, Math.min(5, quality));

        // Map 0-5 quality scale to FSRS grades: Again(1), Hard(2), Good(3), Easy(4)
        int grade;
        if (quality <= 1) {
            grade = 1; // Again
        } else if (quality == 2) {
            grade = 2; // Hard
        } else if (quality <= 4) {
            grade = 3; // Good
        } else {
            grade = 4; // Easy
        }

        int reviewCount = card.getReviewCount() != null ? card.getReviewCount() : 0;
        LocalDateTime now = LocalDateTime.now();

        double stability;
        double difficulty;

        if (reviewCount == 0 || card.getStability() == null) {
            // ─── First review: use initial stability from weights ─────────
            stability = W[grade - 1]; // w0..w3 for Again/Hard/Good/Easy
            difficulty = initDifficulty(grade);
        } else {
            // ─── Subsequent reviews: use real elapsed time and dynamic R ───
            double prevStability = card.getStability() != null ? card.getStability() : W[2];
            double prevDifficulty = card.getDifficulty() != null ? card.getDifficulty() : 5.0;

            // 1. Calculate actual elapsed time since previous review
            double elapsedDays = 0.0;
            if (card.getLastReviewed() != null) {
                long minutes = Math.max(0, java.time.Duration.between(card.getLastReviewed(), now).toMinutes());
                elapsedDays = minutes / 1440.0;
            }

            // 2. Dynamic retrievability via power-law forgetting curve: R(t, S)
            double retrievability = (elapsedDays > 0 && prevStability > 0)
                    ? Math.pow(1.0 + FACTOR * (elapsedDays / prevStability), DECAY)
                    : DESIRED_RETENTION;
            retrievability = Math.max(0.01, Math.min(1.0, retrievability));

            // 3. Update difficulty with mean reversion
            difficulty = nextDifficulty(prevDifficulty, grade);

            // 4. Update stability based on recall vs forgetting
            if (grade == 1) {
                stability = nextForgetStability(prevStability, difficulty, retrievability);
            } else {
                stability = nextRecallStability(prevStability, difficulty, grade, retrievability);
            }
        }

        // Base interval for 90% retention is the stability itself
        double interval = stability;

        // Apply weakness acceleration (topic-aware scheduling)
        weaknessMultiplier = Math.max(0.6, Math.min(1.0, weaknessMultiplier));
        interval = interval * weaknessMultiplier;

        // Contest failure penalty: review sooner
        if (wasContestFailure) {
            interval = interval * 0.5;
        }

        // Clamp interval
        int days = Math.max(1, (int) Math.round(interval));

        // ─── Persist state ───────────────────────────────────────────────
        card.setStability(stability);
        card.setDifficulty(difficulty);
        card.setEaseFactor(stability); // Synchronized for backward compatibility
        card.setIntervalDays((double) days);
        card.setLastReviewed(now);
        card.setNextReview(now.plusDays(days));
        card.setReviewCount(reviewCount + 1);
        card.setConfidence(grade == 1 ? 1 : grade + 1);

        return card;
    }

    // ─── FSRS Internal Functions ─────────────────────────────────────────

    /**
     * Initial difficulty for a card based on first review grade.
     * D₀(G) = w4 − exp(w5 × (G − 1)) + 1
     */
    public double initDifficulty(int grade) {
        double d = W[4] - Math.exp(W[5] * (grade - 1)) + 1.0;
        return clampDifficulty(d);
    }

    /**
     * Next difficulty after a review.
     * Applies mean reversion toward D₀(3) to prevent difficulty from drifting to extremes.
     * D' = w16 × D₀(3) + (1 − w16) × (D − w6 × (grade − 3))
     */
    public double nextDifficulty(double prevD, int grade) {
        double d0Good = initDifficulty(3);
        double delta = -W[6] * (grade - 3);
        double nextD = prevD + delta;
        nextD = W[7] * d0Good + (1.0 - W[7]) * nextD;
        return clampDifficulty(nextD);
    }

    /**
     * Stability after successful recall with dynamic retrievability R.
     * S'_r = S × (1 + exp(w8) × (11 − D) × S^(-w9) × (exp(w10 × (1 − R)) − 1) × hardPenalty × easyBonus)
     */
    public double nextRecallStability(double prevS, double difficulty, int grade, double retrievability) {
        double hardPenalty = (grade == 2) ? W[14] : 1.0; // W[14] = hard penalty
        double easyBonus = (grade == 4) ? W[15] : 1.0;   // W[15] = easy bonus

        double newS = prevS * (1.0 + Math.exp(W[8])
                * (11.0 - difficulty)
                * Math.pow(prevS, -W[9])
                * (Math.exp(W[10] * (1.0 - retrievability)) - 1.0)
                * hardPenalty
                * easyBonus);

        return Math.max(0.1, newS);
    }

    /**
     * Stability after forgetting (grade = Again) with dynamic retrievability R.
     * S'_f = w11 × D^(-w12) × ((S + 1)^w13 − 1) × exp(w18 × (1 − R))
     */
    public double nextForgetStability(double prevS, double difficulty, double retrievability) {
        double newS = W[11]
                * Math.pow(difficulty, -W[12])
                * (Math.pow(prevS + 1.0, W[13]) - 1.0)
                * Math.exp(W[18] * (1.0 - retrievability));

        return Math.max(0.1, Math.min(newS, prevS)); // Can't exceed previous stability on failure
    }

    public double clampDifficulty(double d) {
        return Math.max(1.0, Math.min(10.0, d));
    }
}
