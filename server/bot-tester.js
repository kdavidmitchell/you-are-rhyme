const { parentPort, isMainThread } = require('worker_threads');

const hamletMechanics = ['Lunge', 'Feint', 'Pierce', 'Fracture'];
const gertrudeMechanics = ['Solidify', 'Repel', 'Interpose', 'Disarm'];

function getEntity(entities, type) {
    return entities.find(e => e.type === type);
}

function simulateTurn(state, hamletMech, gertrudeMech) {
    let rapier = getEntity(state, 'rapier');
    let gertrude = getEntity(state, 'gertrude');
    let polonius = getEntity(state, 'polonius');
    let hamlet = getEntity(state, 'hamlet');
    
    let rapierAttached = (hamlet.y === rapier.y && hamlet.x === rapier.x - 1);
    let poloniusKilled = false;

    // --- GERTRUDE DEFENDS ---
    if (gertrudeMech === 'Solidify') {
        // Convert a random furniture to arras
        const furnitures = state.filter(e => e.type === 'furniture');
        if (furnitures.length > 0) {
            furnitures[Math.floor(Math.random() * furnitures.length)].type = 'arras';
        }
    }
    if (gertrudeMech === 'Interpose') {
        gertrude.y = rapier.y;
        gertrude.x = Math.floor((rapier.x + polonius.x) / 2);
    }
    if (gertrudeMech === 'Repel') {
        rapier.x = Math.max(0, rapier.x - 3);
        if (rapierAttached) hamlet.x = rapier.x - 1;
    }
    if (gertrudeMech === 'Disarm') {
        if (rapier.y >= 12) rapier.y -= 2;
        else rapier.y += 2;
        rapierAttached = false;
    }

    // --- HAMLET ATTACKS ---
    if (!rapierAttached && hamletMech !== 'Feint') {
        // Can't attack without weapon
        return { poloniusKilled };
    }

    if (hamletMech === 'Feint') {
        if (!rapierAttached) {
            // Move hamlet towards rapier
            if (hamlet.y < rapier.y) hamlet.y = Math.min(hamlet.y + 2, rapier.y);
            else if (hamlet.y > rapier.y) hamlet.y = Math.max(hamlet.y - 2, rapier.y);
            hamlet.x = Math.min(hamlet.x + 1, rapier.x - 1);
            if (hamlet.y === rapier.y && hamlet.x === rapier.x - 1) rapierAttached = true;
        } else {
            // Move both towards polonius Y
            if (rapier.y < polonius.y) { rapier.y = Math.min(rapier.y + 2, polonius.y); hamlet.y = rapier.y; }
            else if (rapier.y > polonius.y) { rapier.y = Math.max(rapier.y - 2, polonius.y); hamlet.y = rapier.y; }
            rapier.x++; hamlet.x++;
        }
    }

    if (rapierAttached) {
        if (hamletMech === 'Fracture') {
            // Destroy adjacent arras/furniture
            const adj = state.findIndex(e => (e.type === 'arras' || e.type === 'furniture') && e.x === rapier.x + 1 && e.y === rapier.y);
            if (adj !== -1) state.splice(adj, 1);
            rapier.x++; hamlet.x++;
        }

        let moveDistance = 0;
        let pierceFurniture = false;
        if (hamletMech === 'Lunge') moveDistance = 3;
        if (hamletMech === 'Pierce') { moveDistance = 2; pierceFurniture = true; }

        if (moveDistance > 0) {
            for (let step = 0; step < moveDistance; step++) {
                rapier.x++; hamlet.x++;
                const hit = state.find(e => e !== rapier && e !== hamlet && e.x === rapier.x && e.y === rapier.y);
                if (hit) {
                    if (hit.type === 'polonius') {
                        poloniusKilled = true;
                        break;
                    } else if (hit.type === 'arras' || hit.type === 'gertrude') {
                        rapier.x--; hamlet.x--; 
                        break;
                    } else if (hit.type === 'furniture' && !pierceFurniture) {
                        rapier.x--; hamlet.x--;
                        break;
                    }
                }
            }
        }
    }

    return { poloniusKilled };
}

function greedyHamlet(state) {
    const rapier = getEntity(state, 'rapier');
    const polonius = getEntity(state, 'polonius');
    const hamlet = getEntity(state, 'hamlet');
    
    let rapierAttached = (hamlet.y === rapier.y && hamlet.x === rapier.x - 1);
    if (!rapierAttached) return 'Feint';
    
    let blockedBy = null;
    for (let x = rapier.x + 1; x <= polonius.x; x++) {
        const hit = state.find(e => e.x === x && e.y === rapier.y);
        if (hit) { blockedBy = hit.type; break; }
    }
    
    if (!blockedBy || blockedBy === 'polonius') return 'Lunge';
    if (blockedBy === 'furniture') return 'Pierce';
    if (blockedBy === 'arras') return 'Fracture';
    if (blockedBy === 'gertrude') return 'Feint';
    return 'Lunge';
}

function greedyGertrude(state) {
    const rapier = getEntity(state, 'rapier');
    const polonius = getEntity(state, 'polonius');
    
    if (Math.abs(polonius.x - rapier.x) <= 5 && rapier.y === polonius.y) return 'Interpose';
    if (Math.abs(polonius.x - rapier.x) <= 3) return 'Repel';
    if (Math.random() > 0.5) return 'Solidify';
    return 'Disarm';
}

function simulateMatch(config, useGertrude = true) {
    let state = JSON.parse(JSON.stringify(config.entities));
    for (let turn = 0; turn < 9; turn++) {
        const hMech = greedyHamlet(state);
        const gMech = useGertrude ? greedyGertrude(state) : null;
        const result = simulateTurn(state, hMech, gMech);
        if (result.poloniusKilled) return { hamletWins: true, turns: turn + 1 };
    }
    return { hamletWins: false, turns: 9 };
}

function evaluateFitness(config) {
    // Test if Hamlet can win against a dummy
    const dummyMatch = simulateMatch(config, false);
    if (!dummyMatch.hamletWins) return { fitness: 0, solutions: [] };

    // Test if Hamlet can win against greedy Gertrude
    let hamletWinsCounter = 0;
    let totalMatches = 5; // Sim a few matches due to randomness in Solidify/Disarm logic
    
    for (let i = 0; i < totalMatches; i++) {
        const match = simulateMatch(config, true);
        if (match.hamletWins) hamletWinsCounter++;
    }

    const winRate = hamletWinsCounter / totalMatches;
    let balanceMultiplier = 0;
    if (winRate > 0.1 && winRate < 0.9) balanceMultiplier = 2.0; 
    else if (winRate > 0) balanceMultiplier = 1.0; 

    const baseScore = 1000 - (dummyMatch.turns * 50); // Faster dummy win = better path
    let fitness = baseScore * balanceMultiplier;
    
    return { fitness: Math.max(0, fitness), solutions: ['Lunge', 'Feint', 'Pierce', 'Fracture'] };
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

module.exports = { simulateTurn, evaluateFitness, testMechanics: [...hamletMechanics, ...gertrudeMechanics] };
