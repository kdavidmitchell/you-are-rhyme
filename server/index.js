const express = require('express');
const cors = require('cors');
const { logEvent } = require('./db');
const { evaluateVocalInput } = require('./dsl-compiler');
const { generateLevel } = require('./level-generator');
const { db } = require('./db');

const app = express();
app.use(cors());
// Parse raw audio bytes
app.use(express.raw({ type: 'application/octet-stream', limit: '50mb' }));
app.use(express.json());

// Fetch a playable level from the bot-tester DB, or generate a new one if none found
app.get('/api/level', (req, res) => {
    db.get('SELECT config, par, solution FROM levels ORDER BY RANDOM() LIMIT 1', (err, row) => {
        if (err || !row) {
            // Fallback to random generation if DB is empty
            const fallback = generateLevel();
            fallback.par = 3;
            fallback.solution = 'Suspend'; // placeholder
            return res.json(fallback);
        }
        const config = JSON.parse(row.config);
        config.par = row.par;
        
        let solutions = [];
        try {
            solutions = JSON.parse(row.solution);
        } catch(e) {
            solutions = [row.solution];
        }
        
        if (Array.isArray(solutions) && solutions.length > 0) {
            // Pick a random valid solution to act as the cue for the player
            config.solution = solutions[Math.floor(Math.random() * solutions.length)];
        } else {
            config.solution = row.solution;
        }
        
        res.json(config);
    });
});

// Process a turn
app.post('/api/turn', async (req, res) => {
    const audioBytes = req.body;
    const { pauseDuration, wpmDelta } = req.query; // Passed from frontend metadata
    
    try {
        // 1. Transcribe via Python HTTP service
        const pyRes = await fetch('http://localhost:5000/transcribe', {
            method: 'POST',
            body: audioBytes
        });
        const pyData = await pyRes.json();
        const text = pyData.text;
        const actualPauseDuration = pyData.pauseDuration || 0;
        
        console.log(`[Turn] Heard: ${text} | Pauses: ${actualPauseDuration.toFixed(2)}s`);

        // 2. Score via Ollama
        let scores = { semanticScore: 0, volatilityScore: 0, desireScore: 0, disgustScore: 0, burdenScore: 0 };
        if (text) {
            const prompt = `Evaluate the following text for a live theatre performance. Provide the following scores (0.0 to 1.0):
- 'semanticScore': themes of trading places, reversed perspectives, or paradoxical role-swapping.
- 'volatilityScore': emotional weight, anger, or volatility.
- 'desireScore': themes of love, desire, fate, or pulling together.
- 'disgustScore': themes of disgust, rejection, or banishment.
- 'burdenScore': themes of heavy burden, weight, or immense lightness (0 = lightness, 1 = heavy burden).

Respond ONLY with a valid JSON object containing exactly these five keys.

Text: "${text}"`;

            try {
                const ollamaRes = await fetch('http://localhost:11434/api/generate', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ model: 'llama3', prompt, stream: false, format: 'json' })
                });
                const ollamaData = await ollamaRes.json();
                scores = JSON.parse(ollamaData.response);
            } catch (err) {
                console.warn(`[Warning] Ollama semantic evaluation failed (is Ollama running?). Proceeding with default scores.`);
            }
        }

        // 3. Compile DSL (Dominant Force)
        const commands = evaluateVocalInput(
            text, 
            scores, 
            actualPauseDuration, 
            parseFloat(wpmDelta || 0)
        );

        logEvent('session_turn', 'turn_processed', { text, scores, commands });

        res.json({ text, scores, commands });

    } catch (err) {
        console.error('Turn processing error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

const PORT = 3001;
app.listen(PORT, () => {
    console.log(`Turn-Based Backend Orchestrator running on port ${PORT}`);
});
