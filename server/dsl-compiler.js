// dsl-compiler.js
// Maps evaluated scores and physical vocal metrics to Asymmetrical Matter.js DSL commands

function levenshtein(a, b) {
    const matrix = [];
    for (let i = 0; i <= b.length; i++) {
        matrix[i] = [i];
    }
    for (let j = 0; j <= a.length; j++) {
        matrix[0][j] = j;
    }
    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            if (b.charAt(i - 1) === a.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1, // substitution
                    Math.min(
                        matrix[i][j - 1] + 1, // insertion
                        matrix[i - 1][j] + 1  // deletion
                    )
                );
            }
        }
    }
    return matrix[b.length][a.length];
}

function calculateDeviation(expected, actual) {
    if (!expected || !actual) return 1.0;
    const exp = expected.toLowerCase().replace(/[^\w\s]/g, '');
    const act = actual.toLowerCase().replace(/[^\w\s]/g, '');
    const dist = levenshtein(exp, act);
    const maxLen = Math.max(exp.length, act.length);
    if (maxLen === 0) return 0;
    return dist / maxLen; // 0.0 (perfect) to 1.0 (completely different)
}

function evaluateVocalInput(playerRole, expectedText, actualText, scores, pauseDuration, wpmDelta, volume) {
    const deviationScore = calculateDeviation(expectedText, actualText);

    // Normalize metrics to 0.0 - 1.0 scale
    const normPause = Math.min(pauseDuration / 3.0, 1.0); // 3 seconds is max
    const normWpm = Math.min(Math.abs(wpmDelta) / 100.0, 1.0); // 100 delta is max
    const normVolume = Math.min(volume / 0.1, 1.0); // Typical normalized RMS is quite small, approx 0.05-0.1 for shouting

    // The "Dominant Force" paradigm - now asymmetrical
    let mechanics = [];

    if (playerRole === 'HAMLET') {
        mechanics = [
            { name: 'Lunge', value: normVolume, threshold: 0.3, command: { action: 'Lunge', target: 'rapier', magnitude: normVolume } },
            { name: 'Fracture', value: deviationScore, threshold: 0.4, command: { action: 'Fracture', target: 'arras' } },
            { name: 'Feint', value: normWpm, threshold: 0.3, command: { action: 'Feint', target: 'rapier', magnitude: normWpm } },
            { name: 'Pierce', value: normPause, threshold: 0.3, command: { action: 'Pierce', target: 'rapier' } }
        ];
    } else if (playerRole === 'QUEEN') {
        mechanics = [
            { name: 'Solidify', value: normPause, threshold: 0.3, command: { action: 'Solidify', target: 'arras' } },
            { name: 'Repel', value: normVolume, threshold: 0.3, command: { action: 'Repel', target: 'rapier', magnitude: normVolume } },
            { name: 'Interpose', value: normWpm, threshold: 0.3, command: { action: 'Interpose', target: 'gertrude' } },
            { name: 'Disarm', value: deviationScore, threshold: 0.4, command: { action: 'Disarm', target: 'rapier' } }
        ];
    }

    // Find the Dominant Force (highest margin above threshold)
    let dominantMechanic = null;
    let maxMargin = 0; 

    for (const mech of mechanics) {
        const margin = mech.value - mech.threshold;
        if (margin > maxMargin) {
            maxMargin = margin;
            dominantMechanic = mech.command;
        }
    }

    // Return the dominant mechanic if one exists, otherwise empty
    return dominantMechanic ? [dominantMechanic] : [];
}

module.exports = {
    evaluateVocalInput,
    calculateDeviation
};
