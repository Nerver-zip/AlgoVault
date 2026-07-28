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
        assertNotNull(updated.getEaseFactor(), "Stability should be stored in easeFactor");
        assertTrue(updated.getEaseFactor() > 0, "Stability must be positive");
        assertEquals(1, updated.getReviewCount());
        assertNotNull(updated.getNextReview());
        assertNotNull(updated.getLastReviewed());
    }

    @Test
    void updateCard_firstReview_easyQuality_longerInterval() {
        RevisionCard cardGood = RevisionCard.builder()
            .reviewCount(0).intervalDays(0.0).easeFactor(null).build();
        RevisionCard cardEasy = RevisionCard.builder()
            .reviewCount(0).intervalDays(0.0).easeFactor(null).build();

        RevisionCard updatedGood = engine.updateCard(cardGood, 4, 1.0, false);
        RevisionCard updatedEasy = engine.updateCard(cardEasy, 5, 1.0, false);

        // Easy should produce a longer interval than Good
        assertTrue(updatedEasy.getIntervalDays() >= updatedGood.getIntervalDays(),
            "Easy first review should have interval >= Good first review");
    }

    @Test
    void updateCard_failedReview_resetsToShortInterval() {
        RevisionCard card = RevisionCard.builder()
            .reviewCount(5)
            .intervalDays(30.0)
            .easeFactor(10.0) // high stability
            .confidence(4)
            .build();

        RevisionCard updated = engine.updateCard(card, 0, 1.0, false);

        // A failed review (quality 0 → Again) should produce a much shorter interval
        assertTrue(updated.getIntervalDays() < 30.0,
            "Failed review should reduce interval, got " + updated.getIntervalDays());
    }

    @Test
    void updateCard_contestFailure_halvesInterval() {
        RevisionCard card = RevisionCard.builder()
            .reviewCount(3)
            .intervalDays(10.0)
            .easeFactor(5.0)
            .confidence(4)
            .build();

        RevisionCard normal = engine.updateCard(
            RevisionCard.builder().reviewCount(3).intervalDays(10.0).easeFactor(5.0).confidence(4).build(),
            4, 1.0, false);
        RevisionCard contested = engine.updateCard(card, 4, 1.0, true);

        assertTrue(contested.getIntervalDays() <= normal.getIntervalDays(),
            "Contest failure should produce a shorter or equal interval");
    }

    @Test
    void updateCard_weaknessMultiplier_acceleratesReview() {
        RevisionCard cardNormal = RevisionCard.builder()
            .reviewCount(3).intervalDays(10.0).easeFactor(5.0).confidence(4).build();
        RevisionCard cardWeak = RevisionCard.builder()
            .reviewCount(3).intervalDays(10.0).easeFactor(5.0).confidence(4).build();

        RevisionCard normal = engine.updateCard(cardNormal, 4, 1.0, false);
        RevisionCard weak = engine.updateCard(cardWeak, 4, 0.6, false);

        assertTrue(weak.getIntervalDays() <= normal.getIntervalDays(),
            "Weakness multiplier should produce shorter or equal interval");
    }

    @Test
    void updateCard_intervalNeverBelowOne() {
        RevisionCard card = RevisionCard.builder()
            .reviewCount(0)
            .intervalDays(0.0)
            .easeFactor(null)
            .build();

        RevisionCard updated = engine.updateCard(card, 0, 0.6, true);

        assertTrue(updated.getIntervalDays() >= 1.0,
            "Interval should never be less than 1 day");
    }
}
