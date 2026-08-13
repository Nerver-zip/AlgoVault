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
        1.3559,  // w14: hard penalty
        0.2231,  // w15: easy bonus
        0.0280,  // w16: mean reversion strength
        2.9282,  // w17: DECAY exponent for interval calculation
        0.4403   // w18: short-term stability factor
    };

    /** Target retention rate — 90% is the researched optimal for long-term learning. */
    private static final double DESIRED_RETENTION = 0.9;

    /** FSRS DECAY constant used in the interval formula. */
    private static final double DECAY = -W[17];

    /** FSRS FACTOR constant: (9 × (1/R − 1))^(1/DECAY). */
    private static final double FACTOR = Math.pow(9.0 * (1.0 / DESIRED_RETENTION - 1.0), 1.0 / DECAY);

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

        double stability;
        double difficulty;

        if (reviewCount == 0) {
            // ─── First review: use initial stability from weights ─────────
            stability = W[grade - 1]; // w0..w3 for Again/Hard/Good/Easy
            difficulty = initDifficulty(grade);
        } else {
            // ─── Subsequent reviews ──────────────────────────────────────
            double prevStability = card.getEaseFactor() != null ? card.getEaseFactor() : W[2];
            double prevDifficulty = card.getConfidence() != null
                    ? mapConfidenceToDifficulty(card.getConfidence())
                    : 5.0;

            // Update difficulty with mean reversion
            difficulty = nextDifficulty(prevDifficulty, grade);

            if (grade == 1) {
                // Failed review: stability after forgetting
                stability = nextForgetStability(prevStability, difficulty);
            } else {
                // Successful review: stability after recall
                stability = nextRecallStability(prevStability, difficulty, grade);
            }
        }

        // Compute interval from stability using FSRS formula
        double interval = stability * FACTOR;

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
        // We store stability in the easeFactor field for backward compatibility.
        // The UI reads intervalDays and easeFactor — both remain populated.
        card.setIntervalDays((double) days);
        card.setEaseFactor(stability);
        card.setLastReviewed(LocalDateTime.now());
        card.setNextReview(LocalDateTime.now().plusDays(days));
        card.setReviewCount(reviewCount + 1);
        // Map grade back to confidence (1-5) for UI display
        card.setConfidence(grade == 1 ? 1 : grade + 1);

        return card;
    }

    // ─── FSRS Internal Functions ─────────────────────────────────────────

    /**
     * Initial difficulty for a card based on first review grade.
     * D₀(G) = w4 − exp(w5 × (G − 1)) + 1
     */
    private double initDifficulty(int grade) {
        double d = W[4] - Math.exp(W[5] * (grade - 1)) + 1.0;
        return clampDifficulty(d);
    }

    /**
     * Next difficulty after a review.
     * Applies mean reversion toward w4 to prevent difficulty from drifting
     * to extremes (the "ease hell" fix).
     * D' = w16 × (D₀(3) − D) + D + w6 × (grade − 3)
     */
    private double nextDifficulty(double prevD, int grade) {
        double d0Good = W[4] - Math.exp(W[5] * (3 - 1)) + 1.0;
        double delta = -W[6] * (grade - 3);
        double newD = prevD + delta;
        // Mean reversion: pull toward the "Good" baseline
        newD = W[16] * (d0Good - newD) + newD;
        return clampDifficulty(newD);
    }

    /**
     * Stability after successful recall.
     * S'_r = S × (1 + exp(w8) × (11 − D) × S^(-w9) × (exp(w10 × (1 − R)) − 1) × hardPenalty × easyBonus)
     */
    private double nextRecallStability(double prevS, double difficulty, int grade) {
        double hardPenalty = (grade == 2) ? W[14] : 1.0;
        double easyBonus = (grade == 4) ? W[15] : 1.0;
        // Retrievability R at scheduled review date: R = DESIRED_RETENTION (0.90)
        double retrievability = DESIRED_RETENTION;

        double newS = prevS * (1.0 + Math.exp(W[8])
                * (11.0 - difficulty)
                * Math.pow(prevS, -W[9])
                * (Math.exp(W[10] * (1.0 - retrievability)) - 1.0)
                * hardPenalty
                * easyBonus);

        return Math.max(0.1, newS);
    }

    /**
     * Stability after forgetting (grade = Again).
     * S'_f = w11 × D^(-w12) × ((S + 1)^w13 − 1) × exp(w14 × (1 − R))
     *
     * Note: Using w11, w12, w13 indices for the forgetting branch,
     * and w14 is reused here as the retrievability scaling.
     */
    private double nextForgetStability(double prevS, double difficulty) {
        // Retrievability R at scheduled review date: R = DESIRED_RETENTION (0.90)
        double retrievability = DESIRED_RETENTION;

        double newS = W[11]
                * Math.pow(difficulty, -W[12])
                * (Math.pow(prevS + 1.0, W[13]) - 1.0)
                * Math.exp(W[14] * (1.0 - retrievability));

        return Math.max(0.1, Math.min(newS, prevS)); // Can't exceed previous stability on failure
    }

    private double clampDifficulty(double d) {
        return Math.max(1.0, Math.min(10.0, d));
    }

    /**
     * Maps the stored confidence (1-5) back to an approximate FSRS difficulty.
     * Used for backward compatibility with cards that were created before the FSRS upgrade.
     */
    private double mapConfidenceToDifficulty(int confidence) {
        // confidence 1 → hard (D≈8), confidence 5 → easy (D≈2)
        return Math.max(1.0, Math.min(10.0, 10.0 - confidence * 1.6));
    }
}
