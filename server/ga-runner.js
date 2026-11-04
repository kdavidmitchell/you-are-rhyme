// ga-runner.js
// Michael Cook-Inspired Evolutionary Level Design Engine
// Multi-objective genetic algorithm with 2D MAP-Elites Quality Diversity archive

const { generateLevel, getRandomGenotype } = require('./level-generator');
const { evaluateFitness, testMechanics } = require('./bot-tester');
const { db } = require('./db');
const { Worker } = require('worker_threads');
const os = require('os');
const path = require('path');

const POPULATION_SIZE = 40;
const GENERATIONS = 15;
const MUTATION_RATE = 0.15;

// MAP-Elites Grid Dimensions (5x5 = 25 niches)
const MAP_BINS_X = 5; // Claustrophobia (0.0 to 1.0)
const MAP_BINS_Y = 5; // Tactical Friction (0.0 to 1.0)

function getMapCell(claustrophobia = 0.5, tacticalFriction = 0.5) {
    const xBin = Math.min(MAP_BINS_X - 1, Math.max(0, Math.floor(claustrophobia * MAP_BINS_X)));
    const yBin = Math.min(MAP_BINS_Y - 1, Math.max(0, Math.floor(tacticalFriction * MAP_BINS_Y)));
    return { xBin, yBin, key: `${xBin}_${yBin}` };
}

function initializePopulation() {
    return Array.from({ length: POPULATION_SIZE }, () => getRandomGenotype());
}

function crossover(parentA, parentB) {
    const cutY = Math.floor(Math.random() * 8) + 3;
    const cutX = Math.floor(Math.random() * 10) + 5;

    const spatialMix = (arrA, arrB) => {
        const mixed = [];
        (arrA || []).forEach(item => { if (item.x < cutX) mixed.push(JSON.parse(JSON.stringify(item))); });
        (arrB || []).forEach(item => { if (item.x >= cutX) mixed.push(JSON.parse(JSON.stringify(item))); });
        return mixed;
    };

    return {
        poloniusY: parentA.poloniusY < cutY ? parentA.poloniusY : parentB.poloniusY,
        arrasStartY: Math.random() > 0.5 ? parentA.arrasStartY : parentB.arrasStartY,
        arrasLength: Math.random() > 0.5 ? parentA.arrasLength : parentB.arrasLength,
        gertrudeX: parentA.gertrudeX < cutX ? parentA.gertrudeX : parentB.gertrudeX,
        gertrudeY: parentA.gertrudeY < cutY ? parentA.gertrudeY : parentB.gertrudeY,
        hamletX: parentA.hamletX < cutX ? parentA.hamletX : parentB.hamletX,
        hamletY: parentA.hamletY < cutY ? parentA.hamletY : parentB.hamletY,
        furniture: spatialMix(parentA.furniture, parentB.furniture)
    };
}

function mutate(genotype) {
    const g = JSON.parse(JSON.stringify(genotype));

    if (Math.random() < MUTATION_RATE) g.poloniusY += (Math.random() > 0.5 ? 1 : -1);
    if (Math.random() < MUTATION_RATE) g.arrasStartY += (Math.random() > 0.5 ? 1 : -1);
    if (Math.random() < MUTATION_RATE) g.arrasLength += (Math.random() > 0.5 ? 1 : -1);
    if (Math.random() < MUTATION_RATE) g.gertrudeX += (Math.random() > 0.5 ? 1 : -1);
    if (Math.random() < MUTATION_RATE) g.gertrudeY += (Math.random() > 0.5 ? 1 : -1);
    if (Math.random() < MUTATION_RATE) g.hamletX += (Math.random() > 0.5 ? 1 : -1);
    if (Math.random() < MUTATION_RATE) g.hamletY += (Math.random() > 0.5 ? 1 : -1);

    if (Array.isArray(g.furniture)) {
        g.furniture.forEach(furn => {
            if (Math.random() < MUTATION_RATE) furn.x += (Math.random() > 0.5 ? 1 : -1);
            if (Math.random() < MUTATION_RATE) furn.y += (Math.random() > 0.5 ? 1 : -1);
        });

        // Add or remove furniture
        if (Math.random() < (MUTATION_RATE / 2)) {
            if (g.furniture.length > 2 && Math.random() > 0.5) {
                g.furniture.splice(Math.floor(Math.random() * g.furniture.length), 1);
            } else if (g.furniture.length < 10) {
                g.furniture.push({
                    x: Math.floor(Math.random() * 12) + 4,
                    y: Math.floor(Math.random() * 11) + 2
                });
            }
        }
    }

    // Grid bounds enforcement
    g.poloniusY = Math.max(1, Math.min(13, g.poloniusY));
    g.arrasStartY = Math.max(1, Math.min(10, g.arrasStartY));
    g.arrasLength = Math.max(3, Math.min(10, g.arrasLength));
    g.gertrudeX = Math.max(7, Math.min(14, g.gertrudeX));
    g.gertrudeY = Math.max(1, Math.min(13, g.gertrudeY));
    g.hamletX = Math.max(1, Math.min(5, g.hamletX));
    g.hamletY = Math.max(1, Math.min(13, g.hamletY));

    return g;
}

function selectParent(populationWithFitness) {
    const tournamentSize = 3;
    let best = null;
    for (let i = 0; i < tournamentSize; i++) {
        const candidate = populationWithFitness[Math.floor(Math.random() * populationWithFitness.length)];
        if (!best || candidate.fitness > best.fitness) {
            best = candidate;
        }
    }
    return best ? best.genotype : getRandomGenotype();
}

function saveElitesToDB(elites) {
    return new Promise((resolve, reject) => {
        db.serialize(() => {
            // Drop old schema if present and create modern MAP-Elites schema
            db.run('DROP TABLE IF EXISTS levels', (dropErr) => {
                if (dropErr) console.error("Error dropping old levels table:", dropErr);

                db.run(`CREATE TABLE levels (
                    id TEXT PRIMARY KEY,
                    config TEXT,
                    solution TEXT,
                    par INTEGER,
                    fitness REAL,
                    claustrophobia REAL,
                    tactical_friction REAL,
                    map_cell TEXT,
                    entropy_score REAL,
                    tension_score REAL,
                    counterplay_score REAL
                )`, (createErr) => {
                    if (createErr) return reject(createErr);

                    if (!elites || elites.length === 0) return resolve();

                    const stmt = db.prepare(`INSERT OR REPLACE INTO levels 
                        (id, config, solution, par, fitness, claustrophobia, tactical_friction, map_cell, entropy_score, tension_score, counterplay_score) 
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);

                    let completed = 0;
                    elites.forEach(elite => {
                        const cell = getMapCell(
                            elite.features ? elite.features.claustrophobia : 0.5,
                            elite.features ? elite.features.tacticalFriction : 0.5
                        );

                        const bd = elite.breakdown || {};
                        stmt.run(
                            elite.config.id,
                            JSON.stringify(elite.config),
                            JSON.stringify(elite.solutions || []),
                            18,
                            elite.fitness || 0,
                            elite.features ? elite.features.claustrophobia : 0.5,
                            elite.features ? elite.features.tacticalFriction : 0.5,
                            cell.key,
                            bd.entropyScore || 0,
                            bd.tensionScore || 0,
                            bd.counterplayScore || 0,
                            (runErr) => {
                                if (runErr) console.error("DB Insert error:", runErr);
                                completed++;
                                if (completed === elites.length) {
                                    stmt.finalize();
                                    resolve();
                                }
                            }
                        );
                    });
                });
            });
        });
    });
}

async function evaluatePopulationParallel(population, gen) {
    return new Promise((resolve) => {
        const numWorkers = Math.min(os.cpus().length, 6);
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
                    solutions: result.solutions,
                    features: result.features,
                    breakdown: result.breakdown
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
            worker.on('error', (err) => console.error('Worker thread error:', err));
            assignNextTask(worker);
        }
    });
}

async function runGA(maxGens = GENERATIONS) {
    console.log("=== Michael Cook Multi-Faceted GA & MAP-Elites Engine ===");
    console.log(`Population: ${POPULATION_SIZE} | Generations: ${maxGens} | Grid: ${MAP_BINS_X}x${MAP_BINS_Y} MAP-Elites`);

    let population = initializePopulation();
    const mapElitesArchive = new Map(); // key -> elite individual

    let gen = 0;
    while (gen < maxGens) {
        console.log(`\n--- Generation ${gen} ---`);
        const evaluated = await evaluatePopulationParallel(population, gen);

        const sorted = evaluated.sort((a, b) => b.fitness - a.fitness);
        const maxFitness = sorted[0].fitness;
        const avgFitness = sorted.reduce((sum, item) => sum + item.fitness, 0) / POPULATION_SIZE;

        console.log(`Max Fitness: ${maxFitness.toFixed(2)} | Avg Fitness: ${avgFitness.toFixed(2)}`);

        // Place qualifying individuals into 2D MAP-Elites Archive
        let newOccupants = 0;
        for (const ind of evaluated) {
            if (ind.fitness > 0 && ind.features) {
                const cell = getMapCell(ind.features.claustrophobia, ind.features.tacticalFriction);
                const existing = mapElitesArchive.get(cell.key);
                if (!existing || ind.fitness > existing.fitness) {
                    mapElitesArchive.set(cell.key, ind);
                    newOccupants++;
                }
            }
        }

        console.log(`MAP-Elites Filled Cells: ${mapElitesArchive.size}/${MAP_BINS_X * MAP_BINS_Y} (+${newOccupants} updated this gen)`);

        gen++;
        if (gen >= maxGens) break;

        // Form next generation through Elitism + Tournament Selection + Crossover + Mutation
        let nextPopulation = [];
        nextPopulation.push(sorted[0].genotype);
        nextPopulation.push(sorted[1].genotype);

        // Also inject random elites from MAP archive to maintain diversity
        const archiveArray = Array.from(mapElitesArchive.values());
        if (archiveArray.length > 0) {
            const randomNicheElite = archiveArray[Math.floor(Math.random() * archiveArray.length)];
            nextPopulation.push(randomNicheElite.genotype);
        }

        while (nextPopulation.length < POPULATION_SIZE) {
            const parentA = selectParent(sorted);
            const parentB = selectParent(sorted);
            let child = crossover(parentA, parentB);
            child = mutate(child);
            nextPopulation.push(child);
        }
        population = nextPopulation;
    }

    const elitesToSave = Array.from(mapElitesArchive.values());
    console.log(`\nGA Completed. Saving ${elitesToSave.length} MAP-Elites evolved levels to database.`);
    await saveElitesToDB(elitesToSave);
    console.log("Database update complete.");
    return elitesToSave;
}

if (require.main === module) {
    runGA().then(() => {
        console.log("Exiting GA process.");
        process.exit(0);
    }).catch(err => {
        console.error("Fatal GA error:", err);
        process.exit(1);
    });
}

module.exports = {
    runGA,
    crossover,
    mutate,
    selectParent,
    getMapCell,
    saveElitesToDB
};
