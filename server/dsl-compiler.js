// dsl-compiler.js
// Grounded Spoken DSL for "You Are Rhyme"
// Translates vocal performance (acoustic prosody) and script fidelity into parameterized mechanical formactions.

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
    if (!expected && !actual) return 0.0;
    if (!expected || !actual) return 1.0;
    const exp = expected.toLowerCase().replace(/[^\w\s]/g, '').trim();
    const act = actual.toLowerCase().replace(/[^\w\s]/g, '').trim();
    if (exp.length === 0 && act.length === 0) return 0.0;
    const dist = levenshtein(exp, act);
    const maxLen = Math.max(exp.length, act.length);
    return maxLen === 0 ? 0.0 : Math.min(1.0, dist / maxLen);
}

function clamp(val, min, max) {
    return Math.max(min, Math.min(max, val));
}

/**
 * Normalizes raw acoustic and text metrics into bounded [0, 1] physical channels.
 */
function normalizeAcousticMetrics(pauseDuration = 0, wpmDelta = 0, volume = 0, deviationScore = 0) {
    // Volume: typical microphone RMS speech is 0.01 - 0.08, shouts up to 0.15+
    const normVolume = clamp(volume / 0.08, 0.0, 1.0);

    // Dramatic Pause: 0.4s to 2.5s+ silence
    const normPause = clamp(pauseDuration / 2.5, 0.0, 1.0);

    // Pacing Delta: shift of up to +/- 80 WPM from baseline
    const normWpm = clamp(Math.abs(wpmDelta) / 80.0, 0.0, 1.0);

    // Deviation: 0.0 (verbatim) to 1.0 (completely altered / ad-libbed)
    const normDeviation = clamp(deviationScore, 0.0, 1.0);

    return {
        normVolume,
        normPause,
        normWpm,
        normDeviation
    };
}

/**
 * Creates a formal FormactionCommand AST node.
 */
function createFormactionCommand(actor, action, target, parameters, rawMetrics) {
    return {
        actor,
        action,
        target,
        parameters: {
            magnitude: Number(parameters.magnitude.toFixed(3)),
            discreteSteps: Math.max(1, Math.min(4, Math.round(parameters.discreteSteps))),
            charge: Number(parameters.charge.toFixed(3)),
            agility: Number(parameters.agility.toFixed(3)),
            instability: Number(parameters.instability.toFixed(3)),
            isCharged: parameters.charge >= 0.5,
            isUnstable: parameters.instability >= 0.4
        },
        meta: {
            rawMetrics: {
                volume: Number(rawMetrics.volume.toFixed(4)),
                pauseDuration: Number(rawMetrics.pauseDuration.toFixed(2)),
                wpmDelta: Number(rawMetrics.wpmDelta.toFixed(1)),
                deviationScore: Number(rawMetrics.deviationScore.toFixed(3))
            },
            timestamp: Date.now()
        }
    };
}

/**
 * Evaluates vocal performance and compiles into one or more grounded Formaction commands.
 */
function evaluateVocalInput(playerRole, expectedText, actualText, scores, pauseDuration = 0, wpmDelta = 0, volume = 0) {
    const deviationScore = calculateDeviation(expectedText, actualText);
    const { normVolume, normPause, normWpm, normDeviation } = normalizeAcousticMetrics(
        pauseDuration,
        wpmDelta,
        volume,
        deviationScore
    );

    const rawMetrics = { volume, pauseDuration, wpmDelta, deviationScore };

    // Continuous parameter grounding:
    // - Amplitude -> kinetic impulse (1 to 4 discrete steps on grid)
    // - Pause -> charge (penetration depth / barrier fortification)
    // - WPM -> agility (maneuver offset 1 to 3 tiles)
    // - Deviation -> instability (structural fracturing / weapon detachment)
    const discreteSteps = 1 + Math.round(normVolume * 3); // 1, 2, 3, or 4 tiles
    const baseParams = {
        magnitude: normVolume,
        discreteSteps,
        charge: normPause,
        agility: normWpm,
        instability: normDeviation
    };

    const commands = [];

    let drives = [];
    let dominant = null;
    let primaryAction = '';
    let primaryTarget = '';
    let rationale = '';

    if (playerRole === 'HAMLET') {
        // Evaluate candidate drives
        drives = [
            {
                action: 'Lunge',
                target: 'rapier',
                weight: normVolume,
                threshold: 0.25,
                metricName: 'Resonant Volume (RMS)',
                rawMetric: `${volume.toFixed(4)} RMS`
            },
            {
                action: 'Pierce',
                target: 'rapier',
                weight: normPause,
                threshold: 0.25,
                metricName: 'Dramatic Silence',
                rawMetric: `${pauseDuration.toFixed(2)}s pause`
            },
            {
                action: 'Feint',
                target: 'rapier',
                weight: normWpm,
                threshold: 0.25,
                metricName: 'Cadence Variation',
                rawMetric: `${wpmDelta >= 0 ? '+' : ''}${wpmDelta.toFixed(1)} WPM`
            },
            {
                action: 'Fracture',
                target: 'arras',
                weight: normDeviation,
                threshold: 0.35,
                metricName: 'Textual Corruption',
                rawMetric: `${Math.round(deviationScore * 100)}% altered`
            }
        ];

        // Sort by intensity above threshold
        const sortedDrives = [...drives].sort((a, b) => (b.weight - b.threshold) - (a.weight - a.threshold));
        dominant = sortedDrives[0];

        if (dominant.weight >= dominant.threshold) {
            primaryAction = dominant.action;
            primaryTarget = dominant.target;
        } else {
            // Default conservative action if delivery was very quiet/neutral
            primaryAction = 'Feint';
            primaryTarget = 'rapier';
        }

    } else if (playerRole === 'QUEEN') {
        drives = [
            {
                action: 'Barricade',
                target: 'furniture',
                weight: normPause,
                threshold: 0.20,
                metricName: 'Chamber Deliberation',
                rawMetric: `${pauseDuration.toFixed(2)}s pause`
            },
            {
                action: 'Repel',
                target: 'rapier',
                weight: normVolume,
                threshold: 0.50,
                metricName: 'Regal Command (RMS)',
                rawMetric: `${volume.toFixed(4)} RMS`
            },
            {
                action: 'Interpose',
                target: 'gertrude',
                weight: normWpm,
                threshold: 0.20,
                metricName: 'Spatial Agility',
                rawMetric: `${wpmDelta >= 0 ? '+' : ''}${wpmDelta.toFixed(1)} WPM`
            },
            {
                action: 'Disarm',
                target: 'rapier',
                weight: normDeviation,
                threshold: 0.30,
                metricName: 'Blade Deflection',
                rawMetric: `${Math.round(deviationScore * 100)}% altered`
            }
        ];

        const sortedDrives = [...drives].sort((a, b) => (b.weight - b.threshold) - (a.weight - a.threshold));
        dominant = sortedDrives[0];

        if (dominant.weight >= dominant.threshold) {
            primaryAction = dominant.action;
            primaryTarget = dominant.target;
        } else if (normWpm > normPause) {
            primaryAction = 'Interpose';
            primaryTarget = 'gertrude';
        } else {
            primaryAction = 'Barricade';
            primaryTarget = 'furniture';
        }
    }

    // Calculate percentage breakdown across candidate formactions
    const totalWeight = drives.reduce((sum, d) => sum + d.weight, 0);
    let driveBreakdown = drives.map(d => {
        const rawPct = totalWeight > 0 ? (d.weight / totalWeight) * 100 : 25;
        return {
            action: d.action,
            target: d.target,
            metricName: d.metricName,
            rawMetric: d.rawMetric,
            normScore: Number(d.weight.toFixed(3)),
            threshold: d.threshold,
            percentage: Math.round(rawPct),
            isWinner: d.action === primaryAction
        };
    });

    // Ensure percentages sum to exactly 100%
    const currentSum = driveBreakdown.reduce((sum, d) => sum + d.percentage, 0);
    if (currentSum !== 100 && driveBreakdown.length > 0) {
        driveBreakdown[0].percentage += (100 - currentSum);
    }

    // Formulate human-readable editorial rationale
    const winnerData = driveBreakdown.find(d => d.isWinner) || driveBreakdown[0];
    const margin = (winnerData.normScore - winnerData.threshold).toFixed(2);

    if (playerRole === 'HAMLET') {
        if (primaryAction === 'Lunge') {
            rationale = `Lunge triumphed (${winnerData.percentage}% of vocal force). Resonant volume (${volume.toFixed(4)} RMS) cleared its activation threshold with a +${margin} margin, overpowering pause and tempo to drive kinetic thrust.`;
        } else if (primaryAction === 'Pierce') {
            rationale = `Pierce triumphed (${winnerData.percentage}% of vocal force). A measured dramatic silence of ${pauseDuration.toFixed(2)}s surpassed the charge threshold (+${margin}), granting penetrative density over raw amplitude.`;
        } else if (primaryAction === 'Fracture') {
            rationale = `Fracture triumphed (${winnerData.percentage}% of vocal force). Verse alteration of ${Math.round(deviationScore * 100)}% destabilized speech prosody (+${margin} margin), converting vocal instability into barrier destruction.`;
        } else {
            if (dominant && dominant.weight < dominant.threshold) {
                rationale = `Feint selected as conservative recovery. Low vocal energy (${volume.toFixed(4)} RMS) failed to clear the 25% Lunge threshold, resulting in tactical footwork realignment.`;
            } else {
                rationale = `Feint triumphed (${winnerData.percentage}% of vocal force). Rapid tempo cadence (${wpmDelta >= 0 ? '+' : ''}${wpmDelta.toFixed(1)} WPM) dominated all other channels, enabling agile spatial realignment.`;
            }
        }
    } else {
        if (primaryAction === 'Barricade') {
            rationale = `Barricade triumphed (${winnerData.percentage}% of defensive force). Measured chamber pause of ${pauseDuration.toFixed(2)}s (+${margin} margin) commands the space, sliding heavy oak furnishings directly into Hamlet's corridor.`;
        } else if (primaryAction === 'Repel') {
            rationale = `Repel triumphed (${winnerData.percentage}% of defensive force). Sovereign vocal command (${volume.toFixed(4)} RMS) cleared the regal threshold (+${margin}), exerting physical pushback against the advancing blade.`;
        } else if (primaryAction === 'Interpose') {
            rationale = `Interpose triumphed (${winnerData.percentage}% of defensive force). Swift spoken cadence (${wpmDelta >= 0 ? '+' : ''}${wpmDelta.toFixed(1)} WPM) allowed the Queen to step decisively into the line of fire.`;
        } else {
            rationale = `Disarm triumphed (${winnerData.percentage}% of defensive force). Erratic phrasing and high deviation (${Math.round(deviationScore * 100)}%) deflected the rapier's alignment, dislodging the weapon.`;
        }
    }

    const compilationBreakdown = {
        actor: playerRole,
        winner: primaryAction,
        drives: driveBreakdown,
        rationale: rationale,
        timestamp: Date.now()
    };

    // Repel knockback is tuned to 1-2 tiles so Hamlet can make net forward progress
    const steps = (playerRole === 'QUEEN' && primaryAction === 'Repel')
        ? Math.max(1, Math.min(2, Math.round(1 + normVolume)))
        : discreteSteps;

    const primaryCmd = createFormactionCommand(
        playerRole,
        primaryAction,
        primaryTarget,
        { ...baseParams, discreteSteps: steps },
        rawMetrics
    );
    primaryCmd.meta.compilationBreakdown = compilationBreakdown;
    commands.push(primaryCmd);

    // Composite Hamlet Formaction: High instability + high energy produces collateral Fracture
    if (playerRole === 'HAMLET' && primaryAction !== 'Fracture' && normDeviation >= 0.55 && normVolume >= 0.4) {
        const collateralCmd = createFormactionCommand(
            playerRole,
            'Fracture',
            'furniture',
            { ...baseParams, discreteSteps: 1 },
            rawMetrics
        );
        collateralCmd.meta.compilationBreakdown = compilationBreakdown;
        commands.push(collateralCmd);
    }

    // Composite Queen Formaction: High pause + high volume repels and barricades simultaneously
    if (playerRole === 'QUEEN' && primaryAction === 'Repel' && normPause >= 0.5) {
        const reinforceCmd = createFormactionCommand(
            playerRole,
            'Barricade',
            'furniture',
            { ...baseParams, discreteSteps: 1 },
            rawMetrics
        );
        reinforceCmd.meta.compilationBreakdown = compilationBreakdown;
        commands.push(reinforceCmd);
    }

    // Attach breakdown to the array object as well
    commands.breakdown = compilationBreakdown;

    return commands;
}

module.exports = {
    evaluateVocalInput,
    calculateDeviation,
    normalizeAcousticMetrics,
    createFormactionCommand,
    levenshtein
};
