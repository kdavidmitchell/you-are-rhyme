const { generateLevel, getRandomGenotype } = require('./level-generator');
const { evaluateFitness } = require('./bot-tester');
const { db } = require('./db');
const { Worker } = require('worker_threads');
const os = require('os');
const path = require('path');

const POPULATION_SIZE = 150;
const GENERATIONS = 40;
const MUTATION_RATE = 0.1;

function initializePopulation() {
    return Array.from({ length: POPULATION_SIZE }, () => getRandomGenotype());
}

// Crossover: Spatial crossover
function crossover(parentA, parentB) {
    // Pick a random vertical slice line across the 800px canvas
    const cutX = Math.random() * 800; 

    const spatialMix = (arrA, arrB, getXA, getXB) => {
        const mixed = [];
        // Keep elements from Parent A that fall left of the cut
        arrA.forEach(item => { if (getXA(item) < cutX) mixed.push(JSON.parse(JSON.stringify(item))); });
        // Keep elements from Parent B that fall right of the cut
        arrB.forEach(item => { if (getXB(item) >= cutX) mixed.push(JSON.parse(JSON.stringify(item))); });
        return mixed;
    };

    return {
        // Tie the primary objects to the same spatial logic
        crownX: parentA.crownX < cutX ? parentA.crownX : parentB.crownX,
        crownY: parentA.crownX < cutX ? parentA.crownY : parentB.crownY,
        daggerOffsetX: (parentA.crownX + parentA.daggerOffsetX) < cutX ? parentA.daggerOffsetX : parentB.daggerOffsetX,
        daggerOffsetY: (parentA.crownX + parentA.daggerOffsetX) < cutX ? parentA.daggerOffsetY : parentB.daggerOffsetY,
        gravityX: Math.random() > 0.5 ? parentA.gravityX : parentB.gravityX,
        gravityY: Math.random() > 0.5 ? parentA.gravityY : parentB.gravityY,
        
        obstacles: spatialMix(parentA.obstacles, parentB.obstacles, item => item.x, item => item.x),
        debris: spatialMix(
            parentA.debris, 
            parentB.debris, 
            item => parentA.crownX + item.offsetX, 
            item => parentB.crownX + item.offsetX
        ),
        lodestones: spatialMix(
            parentA.lodestones, 
            parentB.lodestones, 
            item => parentA.crownX + item.offsetX, 
            item => parentB.crownX + item.offsetX
        )
    };
}

// Mutation: Structural changes and nudges
function mutate(genotype, currentGen, totalGens) {
    // Decay drops from 1.0 down to ~0.1 as generations pass
    const decay = (currentGen !== undefined && totalGens !== undefined) ? Math.max(0.1, 1 - (currentGen / totalGens)) : 1.0;
    const dynamicRate = MUTATION_RATE * decay;

    if (Math.random() < dynamicRate) genotype.crownX += (Math.random() * 40 - 20) * decay;
    if (Math.random() < dynamicRate) genotype.crownY += (Math.random() * 40 - 20) * decay;
    if (Math.random() < dynamicRate) genotype.daggerOffsetX += (Math.random() * 40 - 20) * decay;
    if (Math.random() < dynamicRate) genotype.daggerOffsetY += (Math.random() * 40 - 20) * decay;
    if (Math.random() < dynamicRate) genotype.gravityX += (Math.random() * 0.4 - 0.2) * decay;
    if (Math.random() < dynamicRate) genotype.gravityY += (Math.random() * 0.4 - 0.2) * decay;
    
    // Nudge existing obstacles
    genotype.obstacles.forEach(obs => {
        if (Math.random() < dynamicRate) obs.x += (Math.random() * 20 - 10) * decay;
        if (Math.random() < dynamicRate) obs.y += (Math.random() * 20 - 10) * decay;
        if (Math.random() < dynamicRate) obs.angle += (Math.random() * 0.2 - 0.1) * decay;
        if (Math.random() < dynamicRate) obs.isGlass = !obs.isGlass;
    });

    // Structural mutation: Add or remove an obstacle
    if (Math.random() < (dynamicRate / 2)) {
        if (genotype.obstacles.length > 0 && Math.random() > 0.5) {
            genotype.obstacles.splice(Math.floor(Math.random() * genotype.obstacles.length), 1);
        } else {
            genotype.obstacles.push({
                x: 100 + Math.random() * 600,
                y: 100 + Math.random() * 400,
                angle: Math.random() * Math.PI,
                isGlass: Math.random() > 0.5
            });
        }
    }

    genotype.debris.forEach(deb => {
        if (Math.random() < dynamicRate) deb.offsetX += (Math.random() * 20 - 10) * decay;
        if (Math.random() < dynamicRate) deb.offsetY += (Math.random() * 20 - 10) * decay;
    });
    
    // Structural mutation for debris
    if (Math.random() < (dynamicRate / 2)) {
        if (genotype.debris.length > 0 && Math.random() > 0.5) {
            genotype.debris.splice(Math.floor(Math.random() * genotype.debris.length), 1);
        } else {
            genotype.debris.push({ offsetX: Math.random() * 200 - 100, offsetY: Math.random() * 200 - 100 });
        }
    }

    genotype.lodestones.forEach(lode => {
        if (Math.random() < dynamicRate) lode.offsetX += (Math.random() * 30 - 15) * decay;
        if (Math.random() < dynamicRate) lode.offsetY += (Math.random() * 30 - 15) * decay;
    });
    
    // Structural mutation for lodestones
    if (Math.random() < (dynamicRate / 2)) {
        if (genotype.lodestones.length > 0 && Math.random() > 0.5) {
            genotype.lodestones.splice(Math.floor(Math.random() * genotype.lodestones.length), 1);
        } else {
            genotype.lodestones.push({ offsetX: Math.random() * 300 - 150, offsetY: Math.random() * 300 - 150 });
        }
    }

    // Ensure within bounds roughly
    genotype.crownX = Math.max(100, Math.min(700, genotype.crownX));
    genotype.crownY = Math.max(100, Math.min(500, genotype.crownY));
    
    // Normalize gravity to roughly -1 to 1 bounds
    genotype.gravityX = Math.max(-1, Math.min(1, genotype.gravityX));
    genotype.gravityY = Math.max(-1, Math.min(1, genotype.gravityY));

    return genotype;
}

// Tournament selection
function selectParent(populationWithFitness) {
    const tournamentSize = 3;
    let best = null;
    for (let i = 0; i < tournamentSize; i++) {
        const candidate = populationWithFitness[Math.floor(Math.random() * populationWithFitness.length)];
        if (!best || candidate.fitness > best.fitness) {
            best = candidate;
        }
    }
    return best.genotype;
}

function saveElitesToDB(elites) {
    return new Promise((resolve) => {
        db.serialize(() => {
            db.run(`CREATE TABLE IF NOT EXISTS levels (
                id TEXT PRIMARY KEY,
                config TEXT,
                solution TEXT,
                par INTEGER
            )`);
            
            db.run('DELETE FROM levels'); 
            
            const stmt = db.prepare('INSERT OR REPLACE INTO levels (id, config, solution, par) VALUES (?, ?, ?, ?)');
            
            let completed = 0;
            if (elites.length === 0) resolve();
            
            elites.forEach(elite => {
                stmt.run(elite.config.id, JSON.stringify(elite.config), JSON.stringify(elite.solutions), 1, (err) => {
                    if (err) console.error("DB Error:", err);
                    completed++;
                    if (completed === elites.length) {
                        stmt.finalize();
                        resolve();
                    }
                });
            });
        });
    });
}

function getFingerprint(item) {
    return item.solutions.slice().sort().join(',');
}

function isTooSimilar(item1, item2) {
    const sameSolutions = getFingerprint(item1) === getFingerprint(item2);
    const similarCrownX = Math.abs(item1.genotype.crownX - item2.genotype.crownX) < 15;
    const similarCrownY = Math.abs(item1.genotype.crownY - item2.genotype.crownY) < 15;
    const sameObstacleCount = item1.genotype.obstacles.length === item2.genotype.obstacles.length;
    return sameSolutions && similarCrownX && similarCrownY && sameObstacleCount;
}

async function evaluatePopulationParallel(population, gen) {
    return new Promise((resolve) => {
        const numWorkers = Math.min(os.cpus().length, 8);
        const workers = [];
        const evaluated = [];
        let completed = 0;
        
        const queue = population.map((genotype, index) => {
            return {
                id: index,
                genotype,
                config: generateLevel(`lvl_gen${gen}_${index}`, genotype),
                assigned: false
            };
        });

        const handleWorkerMessage = (msg, worker) => {
            if (msg.error) {
                console.error(`Worker error:`, msg.error);
                completed++;
            } else {
                const { id, result } = msg;
                const task = queue[id];
                evaluated.push({
                    genotype: task.genotype,
                    config: task.config,
                    fitness: result.fitness,
                    solutions: result.solutions
                });
                completed++;
            }
            
            assignNextTask(worker);
        };

        const assignNextTask = (worker) => {
            const nextTask = queue.find(t => !t.assigned);
            if (nextTask) {
                nextTask.assigned = true;
                worker.postMessage({ id: nextTask.id, config: nextTask.config });
            } else if (completed === queue.length) {
                workers.forEach(w => w.terminate());
                resolve(evaluated);
            }
        };

        for (let i = 0; i < numWorkers; i++) {
            const worker = new Worker(path.join(__dirname, 'bot-tester.js'));
            workers.push(worker);
            
            worker.on('message', (msg) => handleWorkerMessage(msg, worker));
            worker.on('error', (err) => {
                console.error('Worker thread error:', err);
            });
            
            assignNextTask(worker);
        }
    });
}

async function runGA() {
    console.log("Initializing Generation 0...");
    let population = initializePopulation();
    let allTimeElites = [];

    for (let gen = 0; gen < GENERATIONS; gen++) {
        console.log(`\n--- Generation ${gen} ---`);
        
        const evaluated = await evaluatePopulationParallel(population, gen);

        const sorted = evaluated.sort((a, b) => b.fitness - a.fitness);
        const maxFitness = sorted[0].fitness;
        const avgFitness = sorted.reduce((sum, item) => sum + item.fitness, 0) / POPULATION_SIZE;
        
        console.log(`Max Fitness: ${maxFitness.toFixed(2)} | Avg Fitness: ${avgFitness.toFixed(2)}`);
        
        // Save playables from this generation
        const playables = sorted.filter(item => item.fitness > 0);
        console.log(`Playable levels found: ${playables.length}`);
        
        // Enforce Genetic Diversity (Speciation/Deduplication)
        const uniquePlayables = [];
        for (const p of playables) {
            if (!uniquePlayables.some(u => isTooSimilar(u, p))) {
                uniquePlayables.push(p);
            }
        }

        // Merge with allTimeElites and deduplicate again
        const mergedElites = [...allTimeElites, ...uniquePlayables];
        const uniqueElites = [];
        for (const e of mergedElites) {
             if (!uniqueElites.some(u => isTooSimilar(u, e))) {
                 uniqueElites.push(e);
             }
        }
        
        // Keep the top 20 distinct elites
        allTimeElites = uniqueElites.sort((a, b) => b.fitness - a.fitness).slice(0, 20);

        // Next generation
        let nextPopulation = [];
        // Elitism: keep top 2
        nextPopulation.push(sorted[0].genotype);
        nextPopulation.push(sorted[1].genotype);

        while (nextPopulation.length < POPULATION_SIZE) {
            const parentA = selectParent(sorted);
            const parentB = selectParent(sorted);
            let child = crossover(parentA, parentB);
            child = mutate(child, gen, GENERATIONS);
            nextPopulation.push(child);
        }
        population = nextPopulation;
    }

    console.log(`\nGA Completed. Saving top ${allTimeElites.length} evolved levels to database.`);
    await saveElitesToDB(allTimeElites);
    console.log("Save complete. Shutting down.");
    process.exit(0);
}

// Allow importing for tests, or running directly
if (require.main === module) {
    runGA();
}

module.exports = { crossover, mutate, selectParent };
