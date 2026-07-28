package com.algovault.engine;

import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class EloEngineTest {

    private final EloEngine eloEngine = new EloEngine();

    @Test
    void calculateNewElo_winEarlyGames_usesHighK() {
        // New tag (0 games): K should be at maximum (~40)
        int result = eloEngine.calculateNewElo(1500, 1600, 1.0, 0);
        assertTrue(result > 1500, "Win should increase rating");
        // With K~40 and expected ~0.36, gain should be roughly 40 * (1.0 - 0.36) ≈ 26
        assertTrue(result >= 1520 && result <= 1530, "Expected gain ~26 with K=40, got " + (result - 1500));
    }

    @Test
    void calculateNewElo_winMatureTag_usesLowK() {
        // Mature tag (50 games): K = max(10, 40 * min(1, 30/51)) ≈ 23.5
        int result = eloEngine.calculateNewElo(1500, 1600, 1.0, 50);
        assertTrue(result > 1500, "Win should still increase rating");
        // With K≈23 and expected ≈0.36, gain ≈ 23*0.64 ≈ 15
        int gain50 = result - 1500;
        // At 200 games: K = max(10, 40 * 30/201) ≈ 10, gain ≈ 6
        int result200 = eloEngine.calculateNewElo(1500, 1600, 1.0, 200);
        int gain200 = result200 - 1500;
        assertTrue(gain200 < gain50, "K should be lower at 200 games than 50 games");
    }

    @Test
    void calculateNewElo_loss_decreasesRating() {
        int result = eloEngine.calculateNewElo(1500, 1400, 0.0, 10);
        assertTrue(result < 1500, "Loss against easier problem should decrease rating");
    }

    @Test
    void calculateNewElo_partialScore_0_7() {
        // Eventual AC (score 0.7) against an equal-rated problem
        int result = eloEngine.calculateNewElo(1500, 1500, 0.7, 10);
        // Expected = 0.5, so gain = K * (0.7 - 0.5) > 0
        assertTrue(result > 1500, "Partial credit should increase rating when score > expected");
    }

    @Test
    void calculateNewElo_ratingFloor() {
        // Very low rating with a heavy loss should not go below 800
        int result = eloEngine.calculateNewElo(810, 2000, 0.0, 5);
        assertTrue(result >= 800, "Rating should not fall below 800, got " + result);
    }

    @Test
    void calculateNewElo_kFactorDecaysMonotonically() {
        // K-factor should produce decreasing gains for the same matchup as games increase
        int gain0 = eloEngine.calculateNewElo(1500, 1500, 1.0, 0) - 1500;
        int gain30 = eloEngine.calculateNewElo(1500, 1500, 1.0, 30) - 1500;
        int gain200 = eloEngine.calculateNewElo(1500, 1500, 1.0, 200) - 1500;

        assertTrue(gain0 >= gain30, "K should decrease: gain@0=" + gain0 + " >= gain@30=" + gain30);
        assertTrue(gain30 >= gain200, "K should decrease: gain@30=" + gain30 + " >= gain@200=" + gain200);
    }
}
