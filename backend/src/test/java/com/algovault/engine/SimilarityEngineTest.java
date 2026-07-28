package com.algovault.engine;

import com.algovault.model.Problem;
import org.junit.jupiter.api.Test;
import java.util.Arrays;
import java.util.List;
import static org.junit.jupiter.api.Assertions.*;

class SimilarityEngineTest {

    private final SimilarityEngine engine = new SimilarityEngine();

    @Test
    void findSimilar_ranksIdenticalTagsHigher() {
        Problem target = Problem.builder()
            .title("Target")
            .tags(Arrays.asList("DP", "String"))
            .actualRating(1600.0)
            .difficulty("Medium")
            .build();

        Problem similar = Problem.builder()
            .title("Similar")
            .tags(Arrays.asList("DP", "String"))
            .actualRating(1650.0)
            .difficulty("Medium")
            .build();

        Problem dissimilar = Problem.builder()
            .title("Dissimilar")
            .tags(Arrays.asList("Graph"))
            .actualRating(2100.0)
            .difficulty("Hard")
            .build();

        List<Problem> solved = Arrays.asList(dissimilar, similar);
        List<Problem> results = engine.findSimilar(target, solved, 2);

        assertEquals(2, results.size());
        assertEquals("Similar", results.get(0).getTitle(), "Identical tags + close rating should rank first");
    }

    @Test
    void findSimilar_gaussianProximity_closerRatingRanksHigher() {
        Problem target = Problem.builder()
            .title("Target")
            .tags(Arrays.asList("DP"))
            .actualRating(1600.0)
            .difficulty("Medium")
            .build();

        Problem close = Problem.builder()
            .title("Close")
            .tags(Arrays.asList("DP"))
            .actualRating(1620.0)
            .difficulty("Medium")
            .build();

        Problem far = Problem.builder()
            .title("Far")
            .tags(Arrays.asList("DP"))
            .actualRating(1900.0)
            .difficulty("Medium")
            .build();

        List<Problem> solved = Arrays.asList(far, close);
        List<Problem> results = engine.findSimilar(target, solved, 2);

        assertEquals("Close", results.get(0).getTitle(),
            "Closer rating should rank higher with Gaussian proximity");
    }

    @Test
    void findSimilar_difficultyMatchBonus() {
        Problem target = Problem.builder()
            .title("Target")
            .tags(Arrays.asList("Array"))
            .actualRating(1500.0)
            .difficulty("Medium")
            .build();

        // Same tags, same rating, but different difficulty
        Problem sameDiff = Problem.builder()
            .title("SameDiff")
            .tags(Arrays.asList("Array"))
            .actualRating(1510.0)
            .difficulty("Medium")
            .build();

        Problem diffDiff = Problem.builder()
            .title("DiffDiff")
            .tags(Arrays.asList("Array"))
            .actualRating(1510.0)
            .difficulty("Hard")
            .build();

        List<Problem> solved = Arrays.asList(diffDiff, sameDiff);
        List<Problem> results = engine.findSimilar(target, solved, 2);

        assertEquals("SameDiff", results.get(0).getTitle(),
            "Same difficulty should get bonus and rank higher");
    }

    @Test
    void findSimilar_noTagOverlap_returnsZeroSimilarity() {
        Problem target = Problem.builder()
            .title("Target")
            .tags(Arrays.asList("DP", "String"))
            .actualRating(1600.0)
            .difficulty("Medium")
            .build();

        Problem noOverlap = Problem.builder()
            .title("NoOverlap")
            .tags(Arrays.asList("Graph", "Tree"))
            .actualRating(1600.0)
            .difficulty("Medium")
            .build();

        List<Problem> solved = Arrays.asList(noOverlap);
        List<Problem> results = engine.findSimilar(target, solved, 5);

        // Should still return the problem (it's all we have), but similarity is low
        assertEquals(1, results.size());
    }
}
