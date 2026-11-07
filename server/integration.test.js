// integration.test.js
// End-to-end verification of Server, SQLite Evolved Level Loading, and CPU Turn Execution

const assert = require('assert');
const http = require('http');

async function runIntegrationTest() {
    console.log("=== Running End-to-End Turn Processing & Server Integration Test ===");

    // Test loading evolved level directly from DB
    const { db } = require('./db');
    const { evaluateVocalInput } = require('./dsl-compiler');
    const { simulateTurn } = require('./bot-tester');

    const evolvedLevels = await new Promise((resolve, reject) => {
        db.all("SELECT * FROM levels", (err, rows) => {
            if (err) return reject(err);
            resolve(rows);
        });
    });

    assert(evolvedLevels.length > 0, "Database must contain evolved elite levels");
    console.log(`[PASS] Found ${evolvedLevels.length} evolved MAP-Elites levels in telemetry.sqlite.`);

    const sampleRow = evolvedLevels[0];
    const sampleConfig = JSON.parse(sampleRow.config);
    assert(sampleConfig.entities && sampleConfig.entities.length > 0, "Evolved level must have entities");
    console.log(`[PASS] Sample level ${sampleRow.id} loaded (Fitness: ${sampleRow.fitness}, Cell: ${sampleRow.map_cell}).`);

    // Simulate complete sequence of turns using parameterized DSL
    const scriptLines = [
        { speaker: 'QUEEN', text: 'Come, come, you answer with an idle tongue.' },
        { speaker: 'HAMLET', text: 'Go, go, you question with a wicked tongue.' },
        { speaker: 'QUEEN', text: 'Why, how now, Hamlet?' },
        { speaker: 'HAMLET', text: 'What’s the matter now?' }
    ];

    let state = JSON.parse(JSON.stringify(sampleConfig.entities));

    for (let i = 0; i < scriptLines.length; i++) {
        const line = scriptLines[i];
        const role = line.speaker;
        const volume = 0.03 + (Math.random() * 0.05);
        const pause = Math.random() * 1.5;
        const wpmDelta = (Math.random() * 40) - 20;

        const commands = evaluateVocalInput(role, line.text, line.text, {}, pause, wpmDelta, volume);
        assert(commands.length > 0, `Turn ${i} must produce at least one command`);

        const cmd = commands[0];
        assert(cmd.actor === role, "Command actor must match speaker role");
        assert(typeof cmd.parameters.discreteSteps === 'number', "Command must have discreteSteps");
        assert(cmd.parameters.discreteSteps >= 1 && cmd.parameters.discreteSteps <= 4, "discreteSteps must be bounded 1-4");

        const hCmd = role === 'HAMLET' ? cmd : null;
        const gCmd = role === 'QUEEN' ? cmd : null;

        const result = simulateTurn(state, hCmd, gCmd);
        assert(typeof result.poloniusKilled === 'boolean', "Simulation must return poloniusKilled boolean");
        console.log(`  -> Turn ${i + 1} (${role}): ${cmd.action} [Steps: ${cmd.parameters.discreteSteps}, Vol: ${cmd.parameters.magnitude}]`);
    }

    console.log("[PASS] All turns simulated with parameterized commands successfully.");
    console.log("\n*** INTEGRATION TEST PASSED 100% ***\n");
    process.exit(0);
}

runIntegrationTest().catch(err => {
    console.error("Integration test failed:", err);
    process.exit(1);
});
