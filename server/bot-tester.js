const Matter = require('matter-js');
const { parentPort, isMainThread } = require('worker_threads');

const { Engine, Bodies, Composite, Events } = Matter;

function buildWorld(engine, config) {
    Composite.clear(engine.world);
    Engine.clear(engine);
    engine.world.gravity.x = config.gravityX || 0;
    engine.world.gravity.y = config.gravityY !== undefined ? config.gravityY : 1;
    
    config.bodies.forEach(b => {
        let body;
        if (b.type === 'rectangle') {
            body = Bodies.rectangle(b.x, b.y, b.w, b.h, b.options);
        } else if (b.type === 'circle') {
            body = Bodies.circle(b.x, b.y, b.r, b.options);
        }
        if (body) {
            Composite.add(engine.world, body);
        }
    });
}

function simulate(config, mechanicToApply = null) {
    const engine = Engine.create();
    buildWorld(engine, config);
    
    let collisionOccurred = false;
    Events.on(engine, 'collisionStart', (event) => {
        event.pairs.forEach(pair => {
            const labelA = pair.bodyA.label;
            const labelB = pair.bodyB.label;
            
            const isDaggerCrown = (labelA === 'dagger' && labelB === 'crown') ||
                                  (labelB === 'dagger' && labelA === 'crown');
                                  
            const isCrownBoundary = (labelA === 'crown' && ['wall', 'ground', 'ceiling'].includes(labelB)) ||
                                    (labelB === 'crown' && ['wall', 'ground', 'ceiling'].includes(labelA));

            if (isDaggerCrown || isCrownBoundary) {
                collisionOccurred = true;
            }
        });
    });

    if (mechanicToApply) {
        const bodies = Composite.allBodies(engine.world);
        const dagger = bodies.find(b => b.label === 'dagger');
        const crown = bodies.find(b => b.label === 'crown');
        const lodestones = bodies.filter(b => b.label === 'lodestone');
        
        if (mechanicToApply === 'Suspend' && dagger) Matter.Body.setStatic(dagger, true);
        if (mechanicToApply === 'Invert') {
            engine.world.gravity.x *= -1;
            engine.world.gravity.y *= -1;
        }
        if (mechanicToApply === 'Swap' && dagger && crown) {
            const daggerPos = { x: dagger.position.x, y: dagger.position.y };
            const crownPos = { x: crown.position.x, y: crown.position.y };
            Matter.Body.setPosition(dagger, crownPos);
            Matter.Body.setPosition(crown, daggerPos);
            Matter.Body.setVelocity(dagger, { x: 0, y: 0 });
            Matter.Body.setVelocity(crown, { x: 0, y: 0 });
        }
        if (mechanicToApply === 'Fracture') {
            const glass = bodies.filter(b => b.label === 'glass');
            Composite.remove(engine.world, glass);
        }
        if (mechanicToApply === 'Duplicate') {
            const debris = bodies.filter(b => b.label === 'debris');
            debris.forEach(d => {
                const clone = Bodies.rectangle(d.position.x + 30, d.position.y - 30, 40, 40, { density: 0.05, label: 'debris' });
                Composite.add(engine.world, clone);
            });
        }
        if (mechanicToApply === 'AlterMass' && dagger) {
            Matter.Body.setDensity(dagger, dagger.density * 5); // Make it heavy
        }
    }

    let minDistance = Infinity;

    // Run for 300 ticks (5 seconds at 60fps) to match a 1-turn duration
    for (let i = 0; i < 300; i++) {
        const bodies = Composite.allBodies(engine.world);
        const daggers = bodies.filter(b => b.label === 'dagger');
        const lodestones = bodies.filter(b => b.label === 'lodestone');
        const crown = bodies.find(b => b.label === 'crown');
        
        if (mechanicToApply === 'Magnetize' || mechanicToApply === 'Repel') {
            daggers.forEach(dagger => {
                if (lodestones.length > 0) {
                    lodestones.forEach(stone => {
                        const forceMagnitude = 0.005 * dagger.mass;
                        const dx = stone.position.x - dagger.position.x;
                        const dy = stone.position.y - dagger.position.y;
                        const dist = Math.sqrt(dx * dx + dy * dy);
                        // Avoid division by zero
                        if (dist > 0.1) {
                            const force = { 
                                x: (mechanicToApply === 'Magnetize' ? 1 : -1) * (dx / dist) * forceMagnitude, 
                                y: (mechanicToApply === 'Magnetize' ? 1 : -1) * (dy / dist) * forceMagnitude 
                            };
                            Matter.Body.applyForce(dagger, dagger.position, force);
                        }
                    });
                }
            });
        }

        Engine.update(engine, 1000 / 60);
        
        // Track minimum distance
        if (crown && daggers.length > 0) {
            daggers.forEach(d => {
                const dx = d.position.x - crown.position.x;
                const dy = d.position.y - crown.position.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < minDistance) {
                    minDistance = dist;
                }
            });
        }

        if (collisionOccurred) break;
    }
    
    return { survived: !collisionOccurred, minDistance };
}

function getOverlapPenalty(config) {
    const engine = Engine.create();
    buildWorld(engine, config);
    const bodies = Composite.allBodies(engine.world);
    let penalty = 0;
    for (let i = 0; i < bodies.length; i++) {
        for (let j = i + 1; j < bodies.length; j++) {
            const bodyA = bodies[i];
            const bodyB = bodies[j];
            if (['ground', 'ceiling', 'wall'].includes(bodyA.label) || 
                ['ground', 'ceiling', 'wall'].includes(bodyB.label)) {
                continue;
            }
            if (Matter.Bounds.overlaps(bodyA.bounds, bodyB.bounds)) {
                penalty += 100; // Heavy penalty for spawning on top of each other
            }
        }
    }
    return penalty;
}

const testMechanics = ['Suspend', 'Invert', 'Swap', 'Fracture', 'Duplicate', 'Magnetize', 'Repel', 'AlterMass'];

function evaluateFitness(config) {
    const overlapPenalty = getOverlapPenalty(config);
    
    const baseline = simulate(config, null);
    
    // If it survives without any mechanic, it's trivial (0 fitness)
    if (baseline.survived) {
        return { fitness: 0, solutions: [] };
    }
    
    let solutions = [];
    let totalDistanceScore = 0;
    
    for (const mech of testMechanics) {
        const result = simulate(config, mech);
        if (result.survived) {
            solutions.push(mech);
            totalDistanceScore += result.minDistance;
        }
    }
    
    const numSolutions = solutions.length;
    
    // Goldilocks multiplier
    let goldilocksMultiplier = 1;
    if (numSolutions === 0) {
        return { fitness: 0, solutions: [] };
    } else if (numSolutions === 1) {
        goldilocksMultiplier = 1;
    } else if (numSolutions >= 2 && numSolutions <= 4) {
        goldilocksMultiplier = 2; // Optimal sweet spot
    } else if (numSolutions > 4) {
        // Penalize overly open levels
        goldilocksMultiplier = Math.max(0.1, 1 - (numSolutions - 4) * 0.2); 
    }
    
    // Base score + distance gradient
    const baseScore = numSolutions * 10;
    // Cap average distance bonus so it doesn't vastly overpower base score
    const avgDistance = numSolutions > 0 ? (totalDistanceScore / numSolutions) : 0;
    const distanceBonus = Math.min(50, avgDistance * 0.05); 
    
    let fitness = (baseScore + distanceBonus) * goldilocksMultiplier;
    fitness -= overlapPenalty;
    
    return { fitness: Math.max(0, fitness), solutions };
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

module.exports = { simulate, evaluateFitness, testMechanics };
