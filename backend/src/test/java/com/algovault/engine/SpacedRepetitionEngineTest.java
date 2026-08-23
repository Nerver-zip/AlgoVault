package com.algovault.engine;

import com.algovault.model.RevisionCard;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class SpacedRepetitionEngineTest {

    private final SpacedRepetitionEngine engine = new SpacedRepetitionEngine();

    @Test
    void updateCard_firstReview_goodQuality_setsInitialStability() {
        RevisionCard card = RevisionCard.builder()
            .reviewCount(0)
            .intervalDays(0.0)
            .easeFactor(null)
            .build();

        RevisionCard updated = engine.updateCard(card, 4, 1.0, false);

        // FSRS: first Good review should use w[2] = 3.1262 as initial stability
        assertTrue(updated.getIntervalDays() >= 1.0, "First review should set a positive interval");
        assertNotNull(updated.getStability(), "Stability should be stored in stability field");
        assertEquals(3.1262, updated.getStability(), 0.0001, "First Good review stability must equal w[2] (3.1262)");
        assertEquals(1, updated.getReviewCount());
        assertNotNull(updated.getNextReview());
        assertNotNull(updated.getLastReviewed());
    }

    @Test
    void updateCard_firstReview_allGrades_orderCorrectly() {
        RevisionCard cardAgain = engine.updateCard(RevisionCard.builder().reviewCount(0).build(), 1, 1.0, false);
        RevisionCard cardHard  = engine.updateCard(RevisionCard.builder().reviewCount(0).build(), 2, 1.0, false);
        RevisionCard cardGood  = engine.updateCard(RevisionCard.builder().reviewCount(0).build(), 4, 1.0, false);
        RevisionCard cardEasy  = engine.updateCard(RevisionCard.builder().reviewCount(0).build(), 5, 1.0, false);

        // First review stability must strictly follow: Again (0.4072) < Hard (1.1829) < Good (3.1262) < Easy (15.4722)
        assertEquals(0.4072, cardAgain.getStability(), 0.0001);
        assertEquals(1.1829, cardHard.getStability(), 0.0001);
        assertEquals(3.1262, cardGood.getStability(), 0.0001);
        assertEquals(15.4722, cardEasy.getStability(), 0.0001);

        assertTrue(cardAgain.getIntervalDays() <= cardHard.getIntervalDays());
        assertTrue(cardHard.getIntervalDays() <= cardGood.getIntervalDays());
        assertTrue(cardGood.getIntervalDays() <= cardEasy.getIntervalDays());
    }

    @Test
    void updateCard_failedReview_reducesStability() {
        RevisionCard card = RevisionCard.builder()
            .reviewCount(5)
            .intervalDays(30.0)
            .stability(10.0)
            .difficulty(4.0)
            .lastReviewed(java.time.LocalDateTime.now().minusDays(30))
            .build();

        RevisionCard updated = engine.updateCard(card, 0, 1.0, false);

        assertTrue(updated.getStability() < 10.0,
            "Failed review must reduce stability below previous (got " + updated.getStability() + ")");
        assertTrue(updated.getIntervalDays() < 30.0,
            "Failed review must reduce interval, got " + updated.getIntervalDays());
    }

    @Test
    void updateCard_contestFailure_shortensInterval() {
        RevisionCard normal = engine.updateCard(
            RevisionCard.builder().reviewCount(3).intervalDays(10.0).stability(5.0).difficulty(4.0).lastReviewed(java.time.LocalDateTime.now().minusDays(10)).build(),
            4, 1.0, false);
        RevisionCard contested = engine.updateCard(
            RevisionCard.builder().reviewCount(3).intervalDays(10.0).stability(5.0).difficulty(4.0).lastReviewed(java.time.LocalDateTime.now().minusDays(10)).build(),
            4, 1.0, true);

        assertTrue(contested.getIntervalDays() <= normal.getIntervalDays(),
            "Contest failure should produce a shorter or equal interval");
    }

    @Test
    void updateCard_weaknessMultiplier_acceleratesReview() {
        RevisionCard normal = engine.updateCard(
            RevisionCard.builder().reviewCount(3).intervalDays(10.0).stability(5.0).difficulty(4.0).lastReviewed(java.time.LocalDateTime.now().minusDays(10)).build(),
            4, 1.0, false);
        RevisionCard weak = engine.updateCard(
            RevisionCard.builder().reviewCount(3).intervalDays(10.0).stability(5.0).difficulty(4.0).lastReviewed(java.time.LocalDateTime.now().minusDays(10)).build(),
            4, 0.6, false);

        assertTrue(weak.getIntervalDays() <= normal.getIntervalDays(),
            "Weakness multiplier should produce shorter or equal interval");
    }

    @Test
    void updateCard_difficultyEvolution_hardIncreases_easyDecreases() {
        double baselineD = 5.0;

        RevisionCard hardCard = engine.updateCard(
            RevisionCard.builder().reviewCount(2).stability(3.0).difficulty(baselineD).lastReviewed(java.time.LocalDateTime.now().minusDays(5)).build(),
            2, 1.0, false
        );

        RevisionCard easyCard = engine.updateCard(
            RevisionCard.builder().reviewCount(2).stability(3.0).difficulty(baselineD).lastReviewed(java.time.LocalDateTime.now().minusDays(5)).build(),
            5, 1.0, false
        );

        assertTrue(hardCard.getDifficulty() > baselineD,
            "Hard review must increase difficulty (was " + baselineD + ", now " + hardCard.getDifficulty() + ")");
        assertTrue(easyCard.getDifficulty() < baselineD,
            "Easy review must decrease difficulty (was " + baselineD + ", now " + easyCard.getDifficulty() + ")");
    }

    @Test
    void updateCard_subsequentReviews_hardProducesShorterIntervalThanGoodAndEasy() {
        RevisionCard hardCard = engine.updateCard(
            RevisionCard.builder().reviewCount(2).intervalDays(5.0).stability(3.0).difficulty(4.0).lastReviewed(java.time.LocalDateTime.now().minusDays(5)).build(),
            2, // Hard
            1.0, false
        );

        RevisionCard goodCard = engine.updateCard(
            RevisionCard.builder().reviewCount(2).intervalDays(5.0).stability(3.0).difficulty(4.0).lastReviewed(java.time.LocalDateTime.now().minusDays(5)).build(),
            4, // Good
            1.0, false
        );

        RevisionCard easyCard = engine.updateCard(
            RevisionCard.builder().reviewCount(2).intervalDays(5.0).stability(3.0).difficulty(4.0).lastReviewed(java.time.LocalDateTime.now().minusDays(5)).build(),
            5, // Easy
            1.0, false
        );

        assertTrue(hardCard.getStability() < goodCard.getStability(),
            "Hard stability (" + hardCard.getStability() + ") must be less than Good stability (" + goodCard.getStability() + ")");
        assertTrue(goodCard.getStability() < easyCard.getStability(),
            "Good stability (" + goodCard.getStability() + ") must be less than Easy stability (" + easyCard.getStability() + ")");
        assertTrue(hardCard.getIntervalDays() <= goodCard.getIntervalDays(),
            "Hard interval must be <= Good interval");
        assertTrue(goodCard.getIntervalDays() <= easyCard.getIntervalDays(),
            "Good interval must be <= Easy interval");
    }

    @Test
    void updateCard_elapsedDays_longerDelayProducesLargerRecallStabilityJump() {
        // Recalling successfully after a long delay proves strong memory durability -> higher stability jump
        RevisionCard onTimeCard = engine.updateCard(
            RevisionCard.builder().reviewCount(2).stability(3.0).difficulty(4.0).lastReviewed(java.time.LocalDateTime.now().minusDays(3)).build(),
            4, // Good
            1.0, false
        );

        RevisionCard lateCard = engine.updateCard(
            RevisionCard.builder().reviewCount(2).stability(3.0).difficulty(4.0).lastReviewed(java.time.LocalDateTime.now().minusDays(30)).build(),
            4, // Good
            1.0, false
        );

        assertTrue(lateCard.getStability() > onTimeCard.getStability(),
            "Successful recall after longer delay must yield higher stability (onTime: " + onTimeCard.getStability() + ", late: " + lateCard.getStability() + ")");
    }

    @Test
    void updateCard_intervalNeverBelowOne() {
        RevisionCard card = RevisionCard.builder()
            .reviewCount(0)
            .intervalDays(0.0)
            .stability(null)
            .build();

        RevisionCard updated = engine.updateCard(card, 0, 0.6, true);

        assertTrue(updated.getIntervalDays() >= 1.0,
            "Interval should never be less than 1 day");
    }
}
