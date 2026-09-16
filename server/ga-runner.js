const { generateLevel, getRandomGenotype } = require('./level-generator');
const { evaluateFitness, testMechanics } = require('./bot-tester');
const { db } = require('./db');
const { Worker } = require('worker_threads');
const os = require('os');
const path = require('path');

const POPULATION_SIZE = 50;
const GENERATIONS = 20;
const MUTATION_RATE = 0.1;

function initializePopulation() {
    return Array.from({ length: POPULATION_SIZE }, () => getRandomGenotype());
}

function crossover(parentA, parentB) {
    const cutY = Math.floor(Math.random() * 8) + 3;
    const cutX = Math.floor(Math.random() * 10) + 5;

    const spatialMix = (arrA, arrB) => {
        const mixed = [];
        arrA.forEach(item => { if (item.x < cutX) mixed.push(JSON.parse(JSON.stringify(item))); });
        arrB.forEach(item => { if (item.x >= cutX) mixed.push(JSON.parse(JSON.stringify(item))); });
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
    if (Math.random() < MUTATION_RATE) genotype.poloniusY += (Math.random() > 0.5 ? 1 : -1);
    if (Math.random() < MUTATION_RATE) genotype.arrasStartY += (Math.random() > 0.5 ? 1 : -1);
    if (Math.random() < MUTATION_RATE) genotype.arrasLength += (Math.random() > 0.5 ? 1 : -1);
    if (Math.random() < MUTATION_RATE) genotype.gertrudeX += (Math.random() > 0.5 ? 1 : -1);
    if (Math.random() < MUTATION_RATE) genotype.gertrudeY += (Math.random() > 0.5 ? 1 : -1);
    if (Math.random() < MUTATION_RATE) genotype.hamletX += (Math.random() > 0.5 ? 1 : -1);
    if (Math.random() < MUTATION_RATE) genotype.hamletY += (Math.random() > 0.5 ? 1 : -1);
    
    genotype.furniture.forEach(furn => {
        if (Math.random() < MUTATION_RATE) furn.x += (Math.random() > 0.5 ? 1 : -1);
        if (Math.random() < MUTATION_RATE) furn.y += (Math.random() > 0.5 ? 1 : -1);
    });

    if (Math.random() < (MUTATION_RATE / 2)) {
        if (genotype.furniture.length > 0 && Math.random() > 0.5) {
            genotype.furniture.splice(Math.floor(Math.random() * genotype.furniture.length), 1);
        } else {
            genotype.furniture.push({
                x: Math.floor(Math.random() * 12) + 4,
                y: Math.floor(Math.random() * 11) + 2
            });
        }
    }

    // Bounds check
    genotype.poloniusY = Math.max(1, Math.min(13, genotype.poloniusY));
    genotype.arrasStartY = Math.max(1, Math.min(12, genotype.arrasStartY));
    genotype.arrasLength = Math.max(3, Math.min(10, genotype.arrasLength));
    genotype.gertrudeX = Math.max(8, Math.min(15, genotype.gertrudeX));
    genotype.gertrudeY = Math.max(1, Math.min(13, genotype.gertrudeY));
    genotype.hamletX = Math.max(1, Math.min(5, genotype.hamletX));
    genotype.hamletY = Math.max(1, Math.min(13, genotype.hamletY));

    return genotype;
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
                stmt.run(elite.config.id, JSON.stringify(elite.config), JSON.stringify(elite.solutions), 18, (err) => {
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
    const samePolonius = item1.genotype.poloniusY === item2.genotype.poloniusY;
    const sameHamlet = item1.genotype.hamletY === item2.genotype.hamletY;
    return sameSolutions && samePolonius && sameHamlet;
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
            worker.on('error', (err) => console.error('Worker thread error:', err));
            assignNextTask(worker);
        }
    });
}

async function runGA() {
    console.log("Initializing Generation 0...");
    let population = initializePopulation();
    let allTimeElites = [];
    
    let gen = 0;
    while (true) {
        console.log(`\n--- Generation ${gen} ---`);
        const evaluated = await evaluatePopulationParallel(population, gen);

        const sorted = evaluated.sort((a, b) => b.fitness - a.fitness);
        const maxFitness = sorted[0].fitness;
        const avgFitness = sorted.reduce((sum, item) => sum + item.fitness, 0) / POPULATION_SIZE;
        
        console.log(`Max Fitness: ${maxFitness.toFixed(2)} | Avg Fitness: ${avgFitness.toFixed(2)}`);
        
        const playables = sorted.filter(item => item.fitness > 0);
        console.log(`Playable levels found: ${playables.length}`);
        
        const uniquePlayables = [];
        for (const p of playables) {
            if (!uniquePlayables.some(u => isTooSimilar(u, p))) uniquePlayables.push(p);
        }

        const mergedElites = [...allTimeElites, ...uniquePlayables];
        const uniqueElites = [];
        for (const e of mergedElites) {
             if (!uniqueElites.some(u => isTooSimilar(u, e))) uniqueElites.push(e);
        }
        
        allTimeElites = uniqueElites.sort((a, b) => b.fitness - a.fitness).slice(0, 20);

        if (gen >= GENERATIONS) {
            console.log("Target generations reached.");
            break;
        }

        let nextPopulation = [];
        nextPopulation.push(sorted[0].genotype);
        nextPopulation.push(sorted[1].genotype);

        while (nextPopulation.length < POPULATION_SIZE) {
            const parentA = selectParent(sorted);
            const parentB = selectParent(sorted);
            let child = crossover(parentA, parentB);
            child = mutate(child); 
            nextPopulation.push(child);
        }
        population = nextPopulation;
        gen++;
    }

    console.log(`\nGA Completed. Saving top ${allTimeElites.length} evolved levels to database.`);
    await saveElitesToDB(allTimeElites);
    console.log("Save complete. Shutting down.");
    process.exit(0);
}

if (require.main === module) {
    runGA();
}

module.exports = { crossover, mutate, selectParent };
