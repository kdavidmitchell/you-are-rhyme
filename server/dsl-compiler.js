// dsl-compiler.js
// Maps evaluated scores to Matter.js DSL commands using Dominant Force

function calculateRepetitionScore(text) {
    if (!text) return 0;
    const words = text.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/);
    let duplicates = 0;
    for (let i = 0; i < words.length - 1; i++) {
        if (words[i] === words[i+1]) duplicates++;
    }
    // E.g., 2 consecutive duplicate pairs gives a high score
    return Math.min(duplicates / 2, 1.0);
}

function evaluateVocalInput(text, scores, pauseDuration, wpmDelta) {
    const { 
        semanticScore = 0, 
        volatilityScore = 0, 
        desireScore = 0, 
        disgustScore = 0, 
        burdenScore = 0 
    } = scores;

    const repetitionScore = calculateRepetitionScore(text);

    // Normalize physical metrics to 0.0 - 1.0 scale for fair comparison
    const normPause = Math.min(pauseDuration / 3.0, 1.0); // 3 seconds is max
    const normWpm = Math.min(wpmDelta / 100.0, 1.0);      // 100 delta is max

    // Define mechanics, their normalized values, and thresholds
    const mechanics = [
        { name: 'Suspend', value: normPause, threshold: 0.4, command: { action: 'Suspend', target: 'dagger' } },
        { name: 'Invert', value: normWpm, threshold: 0.4, command: { action: 'Invert', target: 'gravity' } },
        { name: 'Swap', value: semanticScore, threshold: 0.4, command: { action: 'Swap', targetA: 'dagger', targetB: 'crown' } },
        { name: 'Fracture', value: volatilityScore, threshold: 0.4, command: { action: 'Fracture', target: 'walls' } },
        { name: 'Duplicate', value: repetitionScore, threshold: 0.4, command: { action: 'Duplicate', target: 'dagger' } },
        { name: 'Magnetize', value: desireScore, threshold: 0.4, command: { action: 'Magnetize', targetA: 'dagger', targetB: 'crown' } },
        { name: 'Repel', value: disgustScore, threshold: 0.4, command: { action: 'Repel', targetA: 'dagger', targetB: 'crown' } },
        { name: 'AlterMass', value: burdenScore, threshold: 0.4, command: { action: 'AlterMass', target: 'dagger', multiplier: 5 } }
    ];

    // Find the Dominant Force (highest margin above threshold)
    let dominantMechanic = null;
    let maxMargin = 0; // Margin must be > 0 to trigger

    for (const mech of mechanics) {
        const margin = mech.value - mech.threshold;
        if (margin > maxMargin) {
            maxMargin = margin;
            dominantMechanic = mech.command;
        }
    }

    return dominantMechanic ? [dominantMechanic] : [];
}

module.exports = {
    evaluateVocalInput
};
