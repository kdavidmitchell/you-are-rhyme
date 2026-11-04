// bot-tester.js
// Parameterized Formaction Simulation Engine & Michael Cook-inspired Multi-Persona Evaluator

const { parentPort, isMainThread } = require('worker_threads');

const hamletMechanics = ['Lunge', 'Feint', 'Pierce', 'Fracture'];
const gertrudeMechanics = ['Barricade', 'Repel', 'Interpose', 'Disarm'];

function getEntity(entities, type) {
    return entities.find(e => e.type === type);
}

function normalizeCommand(rawCmd, defaultAction, actor) {
    if (!rawCmd) return null;
    if (typeof rawCmd === 'string') {
        return {
            actor: actor || 'UNKNOWN',
            action: rawCmd,
            target: 'rapier',
            parameters: {
                magnitude: 0.5,
                discreteSteps: rawCmd === 'Lunge' ? 3 : 2,
                charge: 0.3,
                agility: 0.3,
                instability: 0.2,
                isCharged: false,
                isUnstable: false
            }
        };
    }
    const p = rawCmd.parameters || {};
    return {
        actor: rawCmd.actor || actor || 'UNKNOWN',
        action: rawCmd.action || defaultAction,
        target: rawCmd.target || 'rapier',
        parameters: {
            magnitude: typeof p.magnitude === 'number' ? p.magnitude : 0.5,
            discreteSteps: typeof p.discreteSteps === 'number' ? p.discreteSteps : 2,
            charge: typeof p.charge === 'number' ? p.charge : 0.3,
            agility: typeof p.agility === 'number' ? p.agility : 0.3,
            instability: typeof p.instability === 'number' ? p.instability : 0.2,
            isCharged: !!p.isCharged || (p.charge >= 0.5),
            isUnstable: !!p.isUnstable || (p.instability >= 0.4)
        }
    };
}

/**
 * Simulates a single game turn with parameterized formactions.
 * Consumed identically by server simulation and bot testing.
 */
function simulateTurn(state, hamletInput, gertrudeInput) {
    const hamletCmd = normalizeCommand(hamletInput, 'Lunge', 'HAMLET');
    const gertrudeCmd = normalizeCommand(gertrudeInput, 'Interpose', 'QUEEN');

    let rapier = getEntity(state, 'rapier');
    let gertrude = getEntity(state, 'gertrude');
    let polonius = getEntity(state, 'polonius');
    let hamlet = getEntity(state, 'hamlet');

    if (!rapier || !hamlet || !polonius) {
        return { poloniusKilled: false, rapierAttached: false };
    }

    let rapierAttached = (hamlet.y === rapier.y && hamlet.x === rapier.x - 1);
    let poloniusKilled = false;
    let defensiveIntervention = false;

    // --- 1. GERTRUDE DEFENDS ---
    if (gertrudeCmd) {
        const gParams = gertrudeCmd.parameters;
        const gAction = gertrudeCmd.action;

        if (gAction === 'Barricade') {
            // Relocate nearest furniture piece directly in front of Hamlet's rapier
            const targetX = Math.min(rapier.x + 1, polonius.x - 1);
            const targetY = rapier.y;
            const furnitures = state.filter(e => e.type === 'furniture' && !(e.x === targetX && e.y === targetY));
            if (furnitures.length > 0) {
                furnitures.sort((a, b) => (Math.abs(a.x - targetX) + Math.abs(a.y - targetY)) - (Math.abs(b.x - targetX) + Math.abs(b.y - targetY)));
                furnitures[0].x = targetX;
                furnitures[0].y = targetY;
                defensiveIntervention = true;
            } else if (targetX > rapier.x) {
                state.push({ type: 'furniture', x: targetX, y: targetY });
                defensiveIntervention = true;
            }
        }

        if (gAction === 'Interpose' && gertrude) {
            // Reposition Gertrude directly into Hamlet's firing corridor
            gertrude.y = rapier.y;
            gertrude.x = Math.max(rapier.x + 1, Math.floor((rapier.x + polonius.x) / 2));
            defensiveIntervention = true;
        }

        if (gAction === 'Repel' && rapier) {
            // Kinetic pushback capped at 2 tiles so Hamlet gains net ground on a lunge
            const knockback = Math.max(1, Math.min(2, gParams.discreteSteps || 2));
            rapier.x = Math.max(1, rapier.x - knockback);
            if (rapierAttached) {
                hamlet.x = Math.max(0, rapier.x - 1);
            }
            defensiveIntervention = true;
        }

        if (gAction === 'Disarm' && rapier) {
            // Displace rapier vertically and detach from Hamlet
            const shift = gParams.discreteSteps >= 3 ? 3 : 2;
            if (rapier.y >= 12) rapier.y -= shift;
            else if (rapier.y <= 2) rapier.y += shift;
            else rapier.y += (Math.random() > 0.5 ? shift : -shift);

            rapier.y = Math.max(1, Math.min(13, rapier.y));
            rapierAttached = false;
            defensiveIntervention = true;
        }
    }

    // --- 2. HAMLET ATTACKS ---
    if (hamletCmd) {
        const hParams = hamletCmd.parameters;
        const hAction = hamletCmd.action;

        // If disarmed, Hamlet can only perform Feint to recover the weapon
        if (!rapierAttached && hAction !== 'Feint') {
            return { poloniusKilled, rapierAttached: false, defensiveIntervention };
        }

        if (hAction === 'Feint') {
            const maneuverSteps = Math.max(1, Math.min(3, Math.round(1 + hParams.agility * 2)));
            if (!rapierAttached) {
                // Recover rapier: step Y towards rapier, then X
                if (hamlet.y < rapier.y) hamlet.y = Math.min(hamlet.y + maneuverSteps, rapier.y);
                else if (hamlet.y > rapier.y) hamlet.y = Math.max(hamlet.y - maneuverSteps, rapier.y);

                hamlet.x = Math.min(hamlet.x + 1, rapier.x - 1);
                if (hamlet.y === rapier.y && hamlet.x === rapier.x - 1) {
                    rapierAttached = true;
                }
            } else {
                // Strategic repositioning: adjust Y towards Polonius corridor
                if (rapier.y < polonius.y) {
                    rapier.y = Math.min(rapier.y + maneuverSteps, polonius.y);
                    hamlet.y = rapier.y;
                } else if (rapier.y > polonius.y) {
                    rapier.y = Math.max(rapier.y - maneuverSteps, polonius.y);
                    hamlet.y = rapier.y;
                }
                rapier.x = Math.min(17, rapier.x + 1);
                hamlet.x = rapier.x - 1;
            }
        }

        if (rapierAttached) {
            if (hAction === 'Fracture') {
                // Destroy adjacent barrier
                const adjIdx = state.findIndex(e =>
                    (e.type === 'arras' || e.type === 'furniture') &&
                    e.x === rapier.x + 1 && e.y === rapier.y
                );
                if (adjIdx !== -1) {
                    state.splice(adjIdx, 1);
                }
                // High instability causes collateral destruction above or below
                if (hParams.isUnstable) {
                    const collateralIdx = state.findIndex(e =>
                        (e.type === 'arras' || e.type === 'furniture') &&
                        e.x === rapier.x + 1 && Math.abs(e.y - rapier.y) === 1
                    );
                    if (collateralIdx !== -1) {
                        state.splice(collateralIdx, 1);
                    }
                }
                rapier.x = Math.min(17, rapier.x + 1);
                hamlet.x = rapier.x - 1;
            }

            let moveDistance = 0;
            let pierceFurniture = false;
            let pierceArras = false;

            if (hAction === 'Lunge') {
                moveDistance = hParams.discreteSteps || 3;
                // Charged lunge can penetrate 1 furniture
                if (hParams.isCharged) pierceFurniture = true;
            }

            if (hAction === 'Pierce') {
                moveDistance = Math.max(3, hParams.discreteSteps || 2);
                pierceFurniture = true;
                pierceArras = true; // Any Pierce formaction penetrates the arras
            }

            if (moveDistance > 0) {
                for (let step = 0; step < moveDistance; step++) {
                    rapier.x++;
                    hamlet.x++;

                    const hit = state.find(e =>
                        e !== rapier && e !== hamlet &&
                        e.x === rapier.x && e.y === rapier.y
                    );

                    if (hit) {
                        if (hit.type === 'polonius') {
                            poloniusKilled = true;
                            break;
                        } else if (hit.type === 'gertrude') {
                            // Blocked by Queen
                            rapier.x--;
                            hamlet.x--;
                            break;
                        } else if (hit.type === 'arras') {
                            if (!pierceArras) {
                                rapier.x--;
                                hamlet.x--;
                                break;
                            } else {
                                // Penetrate through the Arras: strikes Polonius if concealed behind this section
                                if (polonius && (polonius.y === rapier.y || Math.abs(polonius.y - rapier.y) <= 1)) {
                                    rapier.x = polonius.x;
                                    rapier.y = polonius.y;
                                    hamlet.x = rapier.x - 1;
                                    hamlet.y = rapier.y;
                                    polonius.type = 'dead';
                                    poloniusKilled = true;
                                    break;
                                }
                            }
                        } else if (hit.type === 'furniture') {
                            if (!pierceFurniture) {
                                rapier.x--;
                                hamlet.x--;
                                break;
                            }
                        }
                    }

                    if (rapier.x >= 18) break;
                }
            }
        }
    }

    return {
        poloniusKilled,
        rapierAttached,
        defensiveIntervention
    };
}

// -----------------------------------------------------------------------------
// Michael Cook-Inspired Playtesting Personas
// -----------------------------------------------------------------------------

/**
 * Persona 1: Aggressive / Bloodthirsty Hamlet
 * Charges straight ahead with max amplitude lunges.
 */
function botHamletAggressive(state) {
    const rapier = getEntity(state, 'rapier');
    const hamlet = getEntity(state, 'hamlet');
    const rapierAttached = (hamlet.y === rapier.y && hamlet.x === rapier.x - 1);

    if (!rapierAttached) {
        return normalizeCommand({ action: 'Feint', parameters: { agility: 0.9, discreteSteps: 3 } }, 'Feint', 'HAMLET');
    }

    return normalizeCommand({
        action: 'Lunge',
        parameters: { magnitude: 0.9, discreteSteps: 4, charge: 0.2, agility: 0.1 }
    }, 'Lunge', 'HAMLET');
}

/**
 * Persona 2: Tactical / Calculating Hamlet
 * Plans around obstacles and aligns Y corridors.
 */
function botHamletTactical(state) {
    const rapier = getEntity(state, 'rapier');
    const polonius = getEntity(state, 'polonius');
    const hamlet = getEntity(state, 'hamlet');
    const rapierAttached = (hamlet.y === rapier.y && hamlet.x === rapier.x - 1);

    if (!rapierAttached) {
        return normalizeCommand({ action: 'Feint', parameters: { agility: 0.8, discreteSteps: 3 } }, 'Feint', 'HAMLET');
    }

    let blockedBy = null;
    for (let x = rapier.x + 1; x <= polonius.x; x++) {
        const hit = state.find(e => e.x === x && e.y === rapier.y);
        if (hit) {
            blockedBy = hit.type;
            break;
        }
    }

    if (!blockedBy || blockedBy === 'polonius') {
        return normalizeCommand({ action: 'Lunge', parameters: { magnitude: 0.8, discreteSteps: 3 } }, 'Lunge', 'HAMLET');
    }
    if (blockedBy === 'furniture') {
        return normalizeCommand({ action: 'Pierce', parameters: { charge: 0.8, discreteSteps: 2 } }, 'Pierce', 'HAMLET');
    }
    if (blockedBy === 'arras') {
        return normalizeCommand({ action: 'Fracture', parameters: { instability: 0.8, discreteSteps: 1 } }, 'Fracture', 'HAMLET');
    }
    if (blockedBy === 'gertrude') {
        return normalizeCommand({ action: 'Feint', parameters: { agility: 0.7, discreteSteps: 2 } }, 'Feint', 'HAMLET');
    }

    return normalizeCommand({ action: 'Lunge', parameters: { magnitude: 0.7, discreteSteps: 3 } }, 'Lunge', 'HAMLET');
}

/**
 * Persona 3: Erratic Hamlet (Human-Variance Proxy)
 * Stochastically explores actions with noisy parameters.
 */
function botHamletErratic(state) {
    const rapier = getEntity(state, 'rapier');
    const hamlet = getEntity(state, 'hamlet');
    const rapierAttached = (hamlet.y === rapier.y && hamlet.x === rapier.x - 1);

    if (!rapierAttached) {
        return normalizeCommand({ action: 'Feint', parameters: { agility: Math.random(), discreteSteps: 2 } }, 'Feint', 'HAMLET');
    }

    const rand = Math.random();
    if (rand < 0.4) return botHamletTactical(state);
    if (rand < 0.6) return normalizeCommand({ action: 'Lunge', parameters: { magnitude: Math.random(), discreteSteps: Math.floor(Math.random() * 4) + 1 } }, 'Lunge', 'HAMLET');
    if (rand < 0.8) return normalizeCommand({ action: 'Pierce', parameters: { charge: Math.random(), discreteSteps: 2 } }, 'Pierce', 'HAMLET');
    return normalizeCommand({ action: 'Fracture', parameters: { instability: Math.random(), discreteSteps: 1 } }, 'Fracture', 'HAMLET');
}

/**
 * Vigilant Gertrude
 * Barricades with furniture, interposes, repels, or disarms when Hamlet advances.
 */
function botGertrudeVigilant(state) {
    const rapier = getEntity(state, 'rapier');
    const polonius = getEntity(state, 'polonius');
    const gertrude = getEntity(state, 'gertrude');

    if (!rapier || !polonius) return null;

    const distToTarget = Math.abs(polonius.x - rapier.x);
    const sameY = rapier.y === polonius.y;
    const pathBlocked = state.some(e =>
        (e.type === 'furniture' || e.type === 'arras') &&
        e.x === rapier.x + 1 && e.y === rapier.y
    );

    // 1. Point-blank range to Polonius (<= 2 tiles): Repel (1-2 tiles)
    if (distToTarget <= 2) {
        return normalizeCommand({ action: 'Repel', parameters: { magnitude: 0.7, discreteSteps: 2 } }, 'Repel', 'QUEEN');
    }
    // 2. If Hamlet is aligned on Polonius corridor and path is open: Barricade with furniture!
    if (sameY && !pathBlocked && distToTarget > 1) {
        return normalizeCommand({ action: 'Barricade', parameters: { charge: 0.8, discreteSteps: 1 } }, 'Barricade', 'QUEEN');
    }
    // 3. If Hamlet is aligned and closing in, Interpose to block corridor
    if (distToTarget <= 5 && sameY && gertrude && gertrude.y !== rapier.y) {
        return normalizeCommand({ action: 'Interpose', parameters: { agility: 0.8, discreteSteps: 2 } }, 'Interpose', 'QUEEN');
    }
    // 4. Disarm chance if Hamlet is nearby and armed
    if (distToTarget <= 4 && Math.random() > 0.5) {
        return normalizeCommand({ action: 'Disarm', parameters: { instability: 0.7, discreteSteps: 2 } }, 'Disarm', 'QUEEN');
    }
    // 5. Default tactical defense: Barricade corridor
    return normalizeCommand({ action: 'Barricade', parameters: { charge: 0.8, discreteSteps: 1 } }, 'Barricade', 'QUEEN');
}

/**
 * Simulates a full match between specified Hamlet persona and Gertrude persona.
 * Returns detailed telemetry including turn count, trajectory, and tension metrics.
 */
function simulateMatch(config, hamletPersona = botHamletTactical, gertrudePersona = botGertrudeVigilant, maxTurns = 14) {
    const state = JSON.parse(JSON.stringify(config.entities));
    const polonius = getEntity(state, 'polonius');
    const trajectory = [];
    const actionsUsed = [];
    let interventions = 0;

    for (let turn = 0; turn < maxTurns; turn++) {
        const rapierBefore = getEntity(state, 'rapier');
        const distBefore = rapierBefore && polonius
            ? Math.abs(polonius.x - rapierBefore.x) + Math.abs(polonius.y - rapierBefore.y)
            : 20;

        const hCmd = hamletPersona(state);
        const gCmd = gertrudePersona ? gertrudePersona(state) : null;

        if (hCmd) actionsUsed.push(hCmd.action);

        const result = simulateTurn(state, hCmd, gCmd);
        if (result.defensiveIntervention) interventions++;

        const rapierAfter = getEntity(state, 'rapier');
        const distAfter = rapierAfter && polonius
            ? Math.abs(polonius.x - rapierAfter.x) + Math.abs(polonius.y - rapierAfter.y)
            : 20;

        trajectory.push({
            turn: turn + 1,
            distanceToTarget: distAfter,
            distanceDelta: distBefore - distAfter,
            poloniusKilled: result.poloniusKilled
        });

        if (result.poloniusKilled) {
            return {
                hamletWins: true,
                turns: turn + 1,
                trajectory,
                actionsUsed,
                interventions
            };
        }
    }

    return {
        hamletWins: false,
        turns: maxTurns,
        trajectory,
        actionsUsed,
        interventions
    };
}

// -----------------------------------------------------------------------------
// Multi-Faceted Michael Cook Fitness Function & MAP-Elites Descriptors
// -----------------------------------------------------------------------------

function calculateActionEntropy(actions) {
    if (!actions || actions.length === 0) return 0;
    const counts = {};
    for (const a of actions) counts[a] = (counts[a] || 0) + 1;
    const total = actions.length;
    let entropy = 0;
    for (const a of Object.keys(counts)) {
        const p = counts[a] / total;
        if (p > 0) entropy -= p * Math.log2(p);
    }
    // Max entropy for 4 actions is log2(4) = 2.0
    return Math.min(1.0, entropy / 2.0);
}

function calculateTensionScore(trajectory, winTurn) {
    if (!trajectory || trajectory.length === 0) return 0;

    // Ideal Shakespearean climax turn is lines 7-11 (Act 3, Scene 4)
    let climaxAlignment = 0;
    if (winTurn >= 6 && winTurn <= 11) {
        climaxAlignment = 1.0;
    } else if (winTurn < 6) {
        climaxAlignment = winTurn / 6.0; // Penalize trivial rush
    } else {
        climaxAlignment = Math.max(0.2, 1.0 - ((winTurn - 11) * 0.2));
    }

    // Tension swings: distance reversals caused by Gertrude
    let tensionSwings = 0;
    for (const p of trajectory) {
        if (p.distanceDelta < 0) tensionSwings++; // Rapier pushed back
    }
    const swingBonus = Math.min(1.0, tensionSwings * 0.4);

    return (climaxAlignment * 0.7) + (swingBonus * 0.3);
}

function calculateSpatialScore(config) {
    const geno = config.genotype || {};
    let score = 1.0;

    // Arras should be substantial but not seal off the entire room
    const arrasLen = geno.arrasLength || 5;
    if (arrasLen < 3 || arrasLen > 9) score -= 0.3;

    // Hamlet and Polonius should have meaningful spatial separation
    const hX = geno.hamletX || 3;
    if (hX > 6) score -= 0.2;

    return Math.max(0.1, score);
}

/**
 * Multi-Faceted Fitness Evaluation
 */
function evaluateFitness(config) {
    // 1. Solvability baseline (Hamlet vs inactive Gertrude)
    const baseline = simulateMatch(config, botHamletTactical, null, 14);
    if (!baseline.hamletWins) {
        return {
            fitness: 0,
            solutions: [],
            features: { claustrophobia: 0.5, tacticalFriction: 0.5 },
            breakdown: { solvability: 0 }
        };
    }

    // 2. Playtesting with Persona Ensemble
    const tacticalSims = 4;
    let tacticalWins = 0;
    let allActions = [];
    let allInterventions = 0;
    let totalWinTurns = 0;
    let bestTrajectory = baseline.trajectory;

    for (let i = 0; i < tacticalSims; i++) {
        const res = simulateMatch(config, botHamletTactical, botGertrudeVigilant, 14);
        if (res.hamletWins) {
            tacticalWins++;
            totalWinTurns += res.turns;
            bestTrajectory = res.trajectory;
        }
        allActions = allActions.concat(res.actionsUsed);
        allInterventions += res.interventions;
    }

    // Also run an aggressive match and an erratic match
    const aggressiveRes = simulateMatch(config, botHamletAggressive, botGertrudeVigilant, 14);
    const erraticRes = simulateMatch(config, botHamletErratic, botGertrudeVigilant, 14);

    const tacticalWinRate = tacticalWins / tacticalSims;
    const avgWinTurn = tacticalWins > 0 ? totalWinTurns / tacticalWins : 14;

    // Counterplay balance: optimal defensive resistance rate is 25% - 50% Hamlet wins against Vigilant Queen
    let counterplayScore = 0;
    if (tacticalWinRate >= 0.2 && tacticalWinRate <= 0.8) {
        counterplayScore = 1.0 - Math.abs(tacticalWinRate - 0.45) * 1.5;
    } else if (tacticalWinRate > 0) {
        counterplayScore = 0.4;
    }

    // Action entropy: reward levels requiring diverse formactions
    const entropyScore = calculateActionEntropy(allActions);

    // Tension score: evaluate pacing curve
    const tensionScore = calculateTensionScore(bestTrajectory, avgWinTurn);

    // Spatial score
    const spatialScore = calculateSpatialScore(config);

    // Composite Fitness: weighted sum of normalized facets
    const fitness = Math.max(0, (
        (counterplayScore * 350) +
        (entropyScore * 250) +
        (tensionScore * 250) +
        (spatialScore * 150)
    ));

    // -------------------------------------------------------------------------
    // MAP-Elites Feature Descriptors (0.0 to 1.0)
    // -------------------------------------------------------------------------
    // Dimension 1: Claustrophobia / Obstacle Density
    const furnitureCount = (config.genotype && config.genotype.furniture) ? config.genotype.furniture.length : 4;
    const arrasLength = (config.genotype && config.genotype.arrasLength) ? config.genotype.arrasLength : 5;
    const claustrophobia = Math.min(1.0, Math.max(0.0, ((furnitureCount - 2) / 8.0) * 0.6 + ((arrasLength - 3) / 7.0) * 0.4));

    // Dimension 2: Tactical Friction / Resistance
    const tacticalFriction = Math.min(1.0, Math.max(0.0, (avgWinTurn / 14.0) * 0.6 + (1.0 - tacticalWinRate) * 0.4));

    const solutions = Array.from(new Set(allActions.filter(Boolean)));

    return {
        fitness: Number(fitness.toFixed(2)),
        solutions: solutions.length > 0 ? solutions : ['Lunge', 'Feint'],
        features: {
            claustrophobia: Number(claustrophobia.toFixed(3)),
            tacticalFriction: Number(tacticalFriction.toFixed(3))
        },
        breakdown: {
            tacticalWinRate: Number(tacticalWinRate.toFixed(2)),
            avgWinTurn: Number(avgWinTurn.toFixed(1)),
            entropyScore: Number(entropyScore.toFixed(3)),
            tensionScore: Number(tensionScore.toFixed(3)),
            counterplayScore: Number(counterplayScore.toFixed(3)),
            spatialScore: Number(spatialScore.toFixed(3))
        }
    };
}

if (!isMainThread && parentPort) {
    parentPort.on('message', (task) => {
        try {
            const { config, id } = task;
            const result = evaluateFitness(config);
            parentPort.postMessage({ id, result });
        } catch (e) {
            parentPort.postMessage({ id, error: e.message });
        }
    });
}

module.exports = {
    simulateTurn,
    simulateMatch,
    evaluateFitness,
    calculateActionEntropy,
    calculateTensionScore,
    normalizeCommand,
    botHamletTactical,
    botHamletAggressive,
    botHamletErratic,
    botGertrudeVigilant,
    testMechanics: [...hamletMechanics, ...gertrudeMechanics]
};
