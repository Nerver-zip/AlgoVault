package com.algovault.engine;

import org.junit.jupiter.api.Test;
import java.util.ArrayList;
import java.util.List;
import static org.junit.jupiter.api.Assertions.*;

class Glicko2MasteryEngineTest {

    private final Glicko2MasteryEngine engine = new Glicko2MasteryEngine();

    @Test
    void updateRating_noMatches_decaysRatingDeviation() {
        Glicko2MasteryEngine.GlickoRating initial = new Glicko2MasteryEngine.GlickoRating(1500.0, 200.0, 0.06);
        Glicko2MasteryEngine.GlickoRating updated = engine.updateRating(initial, null);

        assertEquals(1500.0, updated.rating);
        assertTrue(updated.rd > 200.0); // RD should increase (time decay)
        assertEquals(0.06, updated.volatility);
    }

    @Test
    void updateRating_winsAgainstMatches_increasesRating() {
        Glicko2MasteryEngine.GlickoRating initial = new Glicko2MasteryEngine.GlickoRating(1500.0, 200.0, 0.06);
        List<Glicko2MasteryEngine.MatchResult> matches = new ArrayList<>();
        matches.add(new Glicko2MasteryEngine.MatchResult(1400.0, 30.0, 1.0)); // Win against 1400
        matches.add(new Glicko2MasteryEngine.MatchResult(1550.0, 100.0, 1.0)); // Win against 1550

        Glicko2MasteryEngine.GlickoRating updated = engine.updateRating(initial, matches);

        assertTrue(updated.rating > 1500.0);
        assertTrue(updated.rd < 200.0); // RD should decrease (more information)
    }

    @Test
    void solveProbabilityEngine_withRealFocusSeconds_calculatesAccurateMedianMinutes() {
        SolveProbabilityEngine solveEngine = new SolveProbabilityEngine();
        com.algovault.model.User user = com.algovault.model.User.builder().id(1L).build();
        com.algovault.model.Problem targetProblem = com.algovault.model.Problem.builder().id(100L).titleSlug("target-problem").actualRating(1600.0).build();

        com.algovault.model.Problem comp1 = com.algovault.model.Problem.builder().id(101L).actualRating(1580.0).build();
        com.algovault.model.Problem comp2 = com.algovault.model.Problem.builder().id(102L).actualRating(1610.0).build();
        com.algovault.model.Problem comp3 = com.algovault.model.Problem.builder().id(103L).actualRating(1650.0).build();

        List<com.algovault.model.ProblemOpenEvent> realEvents = List.of(
            com.algovault.model.ProblemOpenEvent.builder().problem(comp1).focusSeconds(600).solved(true).build(),   // 10 mins
            com.algovault.model.ProblemOpenEvent.builder().problem(comp2).focusSeconds(1200).solved(true).build(),  // 20 mins
            com.algovault.model.ProblemOpenEvent.builder().problem(comp3).focusSeconds(1800).solved(true).build()   // 30 mins
        );

        com.algovault.dto.PredictionResponse response = solveEngine.predict(user, targetProblem, List.of(), List.of(), List.of(), realEvents);

        assertNotNull(response);
        assertEquals(20, response.getExpectedTimeMinutes(), "Median of 10, 20, 30 minutes must equal 20 minutes");
    }
}
