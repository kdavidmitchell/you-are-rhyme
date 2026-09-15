const assert = require('assert');
const { crossover, mutate } = require('./ga-runner');
const { getRandomGenotype } = require('./level-generator');

function runTests() {
    console.log("Running GA Unit Tests...");

    const parentA = getRandomGenotype();
    const parentB = getRandomGenotype();

    // Test Crossover
    const child = crossover(parentA, parentB);
    assert(child.crownX === parentA.crownX || child.crownX === parentB.crownX, "Crossover should inherit crownX from a parent");
    assert(child.daggerOffsetX === parentA.daggerOffsetX || child.daggerOffsetX === parentB.daggerOffsetX, "Crossover should inherit daggerOffsetX from a parent");
    assert(Array.isArray(child.obstacles), "Crossover should produce an obstacles array");

    // Test Mutation
    const originalCrownX = child.crownX;
    // Force a high mutation rate for test reliability
    const mutated = mutate(JSON.parse(JSON.stringify(child)), 0, 10);
    
    assert(mutated.crownX !== undefined, "Mutated genotype should still have crownX");
    assert(mutated.obstacles !== undefined, "Mutated genotype should still have obstacles");
    
    console.log("All tests passed!");
}

if (require.main === module) {
    runTests();
}

module.exports = { runTests };
