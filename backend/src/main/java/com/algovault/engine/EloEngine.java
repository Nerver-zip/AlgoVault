package com.algovault.engine;

import org.springframework.stereotype.Component;

/**
 * Adaptive Elo rating engine for per-tag skill tracking.
 *
 * <p>Key improvements over vanilla Elo:</p>
 * <ul>
 *   <li><b>Adaptive K-factor</b>: K decays as games increase —
 *       K = max(10, 40 × min(1, 30 / (gamesPlayed + 1))).
 *       New tags swing fast; mature tags converge.</li>
 *   <li><b>Fractional scoring</b>: Supports 0.0 (loss), 0.7 (eventual AC),
 *       1.0 (first-try AC) — not just binary win/loss.</li>
 *   <li><b>Rating floor</b>: Output is clamped to a minimum of 800
 *       to prevent degenerate negative ratings.</li>
 * </ul>
 *
 * <p>The expected-score formula uses the standard Elo logistic with
 * base 10 and a 400-point scale:</p>
 * <pre>
 *   E = 1 / (1 + 10^((opponentRating − playerRating) / 400))
 * </pre>
 */
@Component
public class EloEngine {

    private static final double K_MAX = 40.0;
    private static final double K_MIN = 10.0;
    private static final double K_TRANSITION_GAMES = 30.0;
    private static final int RATING_FLOOR = 800;

    /**
     * Computes the new Elo rating after a single problem attempt.
     *
     * @param currentElo    the player's current Elo on this tag
     * @param problemRating the difficulty rating of the problem (opponent)
     * @param score         match outcome: 1.0 = first-try AC, 0.7 = eventual AC, 0.0 = unsolved
     * @param gamesPlayed   total problems already rated on this tag (controls K decay)
     * @return the updated Elo rating (≥ 800)
     */
    public int calculateNewElo(int currentElo, int problemRating, double score, int gamesPlayed) {
        double expected = 1.0 / (1.0 + Math.pow(10, (problemRating - currentElo) / 400.0));

        // Adaptive K: starts at K_MAX for new tags, decays to K_MIN as evidence accumulates
        double K = Math.max(K_MIN, K_MAX * Math.min(1.0, K_TRANSITION_GAMES / (gamesPlayed + 1.0)));

        int newElo = currentElo + (int) Math.round(K * (score - expected));
        return Math.max(RATING_FLOOR, newElo);
    }
}
