// ga.test.js
// Unit & Integration Test Suite for Spoken DSL, Formaction Simulation, and Michael Cook-inspired GA

const assert = require('assert');
const { crossover, mutate, getMapCell } = require('./ga-runner');
const { getRandomGenotype, generateLevel } = require('./level-generator');
const {
    simulateTurn,
    simulateMatch,
    evaluateFitness,
    calculateActionEntropy,
    calculateTensionScore,
    botHamletTactical,
    botHamletAggressive,
    botGertrudeVigilant
} = require('./bot-tester');
const {
    evaluateVocalInput,
    calculateDeviation,
    normalizeAcousticMetrics,
    createFormactionCommand
} = require('./dsl-compiler');

function runTests() {
    console.log("=== Running You Are Rhyme Test Suite ===");

    // -------------------------------------------------------------------------
    // 1. Spoken DSL & AST Compilation Tests
    // -------------------------------------------------------------------------
    console.log("[1/5] Testing Spoken DSL Compiler...");

    // Test text deviation
    assert.strictEqual(calculateDeviation("Come come", "Come come"), 0.0, "Exact match should have 0.0 deviation");
    assert(calculateDeviation("What wilt thou do", "Something completely different") > 0.5, "Altered text should have high deviation");

    // Test acoustic metric normalization
    const norm = normalizeAcousticMetrics(2.5, 80, 0.08, 0.5);
    assert.strictEqual(norm.normPause, 1.0, "2.5s pause should normalize to 1.0");
    assert.strictEqual(norm.normWpm, 1.0, "80 WPM delta should normalize to 1.0");
    assert.strictEqual(norm.normVolume, 1.0, "0.08 RMS should normalize to 1.0");
    assert.strictEqual(norm.normDeviation, 0.5, "0.5 deviation should remain 0.5");

    // Test Hamlet Lunge compilation with high volume
    const hamletHighVol = evaluateVocalInput('HAMLET', 'Go go', 'Go go', {}, 0.2, 10, 0.09);
    assert(hamletHighVol.length > 0, "Should generate at least one command");
    assert.strictEqual(hamletHighVol[0].action, 'Lunge', "High volume should trigger Lunge");
    assert(hamletHighVol[0].parameters.discreteSteps >= 3, "High volume should yield >= 3 discrete steps");
    assert(hamletHighVol[0].parameters.magnitude >= 0.8, "Magnitude should reflect normalized volume");

    // Test Hamlet Pierce compilation with long pause
    const hamletLongPause = evaluateVocalInput('HAMLET', 'Go go', 'Go go', {}, 2.4, 0, 0.01);
    assert.strictEqual(hamletLongPause[0].action, 'Pierce', "Long dramatic pause should trigger Pierce");
    assert(hamletLongPause[0].parameters.charge >= 0.8, "Pierce should carry high charge parameter");

    // Test Queen Repel and Barricade
    const queenVol = evaluateVocalInput('QUEEN', 'Why how now', 'Why how now', {}, 0.1, 0, 0.08);
    assert.strictEqual(queenVol[0].action, 'Repel', "Queen high volume should trigger Repel");
    assert(queenVol[0].parameters.discreteSteps >= 1 && queenVol[0].parameters.discreteSteps <= 2, "Repel knockback should be capped at 1-2 tiles so Hamlet can gain ground");

    const queenPause = evaluateVocalInput('QUEEN', 'Come come', 'Come come', {}, 2.2, 0, 0.01);
    assert.strictEqual(queenPause[0].action, 'Barricade', "Queen dramatic pause should trigger Barricade");
    assert(queenPause[0].target === 'furniture', "Barricade target should be furniture");

    // Test Compilation Breakdown quantification
    assert(queenPause.breakdown, "evaluateVocalInput must return breakdown metadata");
    assert.strictEqual(queenPause.breakdown.winner, 'Barricade', "Breakdown winner must match primary action");
    assert.strictEqual(queenPause.breakdown.drives.length, 4, "Breakdown must include all 4 candidate drives");
    const pctSum = queenPause.breakdown.drives.reduce((s, d) => s + d.percentage, 0);
    assert.strictEqual(pctSum, 100, "Candidate drive percentages must sum to 100%");
    assert(typeof queenPause.breakdown.rationale === 'string' && queenPause.breakdown.rationale.length > 10, "Breakdown must provide explanatory rationale");

    console.log(" -> Spoken DSL Compiler tests passed.");

    // -------------------------------------------------------------------------
    // 2. Genotype, Crossover & Mutation Tests
    // -------------------------------------------------------------------------
    console.log("[2/5] Testing GA Genotype, Crossover & Mutation...");

    const parentA = getRandomGenotype();
    const parentB = getRandomGenotype();

    assert(typeof parentA.poloniusY === 'number', "Genotype must contain poloniusY");
    assert(typeof parentA.arrasLength === 'number', "Genotype must contain arrasLength");
    assert(Array.isArray(parentA.furniture), "Genotype must contain furniture array");

    const child = crossover(parentA, parentB);
    assert(typeof child.poloniusY === 'number', "Child must inherit poloniusY");
    assert(typeof child.arrasStartY === 'number', "Child must inherit arrasStartY");
    assert(typeof child.gertrudeX === 'number', "Child must inherit gertrudeX");
    assert(Array.isArray(child.furniture), "Child must possess furniture array");

    // Test Mutation bounds
    const mutated = mutate(child);
    assert(mutated.poloniusY >= 1 && mutated.poloniusY <= 13, "Mutated poloniusY must stay in bounds");
    assert(mutated.hamletX >= 1 && mutated.hamletX <= 5, "Mutated hamletX must stay in bounds");
    assert(mutated.arrasLength >= 3 && mutated.arrasLength <= 10, "Mutated arrasLength must be valid");

    console.log(" -> Genotype, Crossover & Mutation tests passed.");

    // -------------------------------------------------------------------------
    // 3. Parameterized Formaction Mechanics Simulation
    // -------------------------------------------------------------------------
    console.log("[3/5] Testing Parameterized Grid Simulation...");

    const level = generateLevel('test_lvl', parentA);
    const state = JSON.parse(JSON.stringify(level.entities));

    // Test Hamlet Lunge movement
    const rapierBefore = state.find(e => e.type === 'rapier');
    const startX = rapierBefore.x;

    const lungeCmd = createFormactionCommand(
        'HAMLET',
        'Lunge',
        'rapier',
        { magnitude: 1.0, discreteSteps: 3, charge: 0.1, agility: 0.1, instability: 0.0 },
        { volume: 0.08, pauseDuration: 0, wpmDelta: 0, deviationScore: 0 }
    );

    simulateTurn(state, lungeCmd, null);
    const rapierAfter = state.find(e => e.type === 'rapier');
    assert(rapierAfter.x >= startX, "Lunge must advance rapier x position");

    // Test Gertrude Repel knockback
    const repelCmd = createFormactionCommand(
        'QUEEN',
        'Repel',
        'rapier',
        { magnitude: 1.0, discreteSteps: 3, charge: 0.1, agility: 0.1, instability: 0.0 },
        { volume: 0.08, pauseDuration: 0, wpmDelta: 0, deviationScore: 0 }
    );

    const xBeforeRepel = rapierAfter.x;
    simulateTurn(state, null, repelCmd);
    const xAfterRepel = state.find(e => e.type === 'rapier').x;
    assert(xAfterRepel <= xBeforeRepel, "Repel must knock rapier back");

    // Test Gertrude Barricade furniture relocation
    const barricadeCmd = createFormactionCommand(
        'QUEEN',
        'Barricade',
        'furniture',
        { magnitude: 0.5, discreteSteps: 1, charge: 0.8, agility: 0.2, instability: 0.0 },
        { volume: 0.01, pauseDuration: 2.0, wpmDelta: 0, deviationScore: 0 }
    );
    const rapierCurrent = state.find(e => e.type === 'rapier');
    simulateTurn(state, null, barricadeCmd);
    const obstacleInFront = state.find(e => e.type === 'furniture' && e.x === rapierCurrent.x + 1 && e.y === rapierCurrent.y);
    assert(obstacleInFront, "Barricade must relocate or spawn furniture directly in front of the rapier");

    console.log(" -> Parameterized Grid Simulation tests passed.");

    // -------------------------------------------------------------------------
    // 4. Playtesting Personas & Michael Cook Fitness Metrics
    // -------------------------------------------------------------------------
    console.log("[4/5] Testing Playtesting Personas & Michael Cook Fitness...");

    // Test Action Entropy Calculation
    const singleAction = ['Lunge', 'Lunge', 'Lunge'];
    const diverseActions = ['Lunge', 'Feint', 'Pierce', 'Fracture'];
    assert.strictEqual(calculateActionEntropy(singleAction), 0.0, "Single action should have 0 entropy");
    assert(calculateActionEntropy(diverseActions) > 0.8, "Diverse action set should yield high entropy");

    // Test Tension Score Calculation
    const mockTrajectory = [
        { turn: 1, distanceDelta: 3 },
        { turn: 2, distanceDelta: -2 }, // Repelled back (tension swing!)
        { turn: 3, distanceDelta: 2 },
        { turn: 8, distanceDelta: 2 }   // Climax at turn 8
    ];
    const tension = calculateTensionScore(mockTrajectory, 8);
    assert(tension > 0.6, "Dramatic trajectory with climax at turn 8 should have high tension score");

    // Test Full Fitness Evaluation
    const evalResult = evaluateFitness(level);
    assert(typeof evalResult.fitness === 'number', "Fitness must be numeric");
    assert(evalResult.fitness >= 0, "Fitness must be non-negative");
    assert(evalResult.features && typeof evalResult.features.claustrophobia === 'number', "Features must include claustrophobia");
    assert(evalResult.features && typeof evalResult.features.tacticalFriction === 'number', "Features must include tacticalFriction");
    assert(Array.isArray(evalResult.solutions), "Solutions must be an array of mechanics");

    console.log(" -> Michael Cook Fitness & Persona tests passed.");

    // -------------------------------------------------------------------------
    // 5. MAP-Elites 2D Niching
    // -------------------------------------------------------------------------
    console.log("[5/5] Testing MAP-Elites 2D Bins...");

    const cellMin = getMapCell(0.05, 0.05);
    const cellMax = getMapCell(0.95, 0.95);
    const cellMid = getMapCell(0.5, 0.5);

    assert.strictEqual(cellMin.key, "0_0", "Low features should map to cell 0_0");
    assert.strictEqual(cellMax.key, "4_4", "High features should map to cell 4_4");
    assert.strictEqual(cellMid.key, "2_2", "Mid features should map to cell 2_2");

    console.log(" -> MAP-Elites 2D Bins tests passed.");
    console.log("\n*** ALL TESTS PASSED SUCCESSFULLY! ***\n");
}

if (require.main === module) {
    runTests();
}

module.exports = { runTests };
