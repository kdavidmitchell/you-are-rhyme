const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const { logEvent } = require('./db');
const { evaluateVocalInput } = require('./dsl-compiler');
const { simulateTurn } = require('./bot-tester');
const { generateLevel } = require('./level-generator');
const { db } = require('./db');

const app = express();
app.use(cors());
app.use(express.raw({ type: 'application/octet-stream', limit: '50mb' }));
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] }
});

const scriptLines = [
    { speaker: 'QUEEN', text: 'Come, come, you answer with an idle tongue.' },
    { speaker: 'HAMLET', text: 'Go, go, you question with a wicked tongue.' },
    { speaker: 'QUEEN', text: 'Why, how now, Hamlet?' },
    { speaker: 'HAMLET', text: 'What’s the matter now?' },
    { speaker: 'QUEEN', text: 'Have you forgot me?' },
    { speaker: 'HAMLET', text: 'No, by the rood, not so. You are the Queen, your husband’s brother’s wife, And (would it were not so) you are my mother.' },
    { speaker: 'QUEEN', text: 'Nay, then I’ll set those to you that can speak.' },
    { speaker: 'HAMLET', text: 'Come, come, and sit you down; you shall not budge. You go not till I set you up a glass Where you may see the inmost part of you.' },
    { speaker: 'QUEEN', text: 'What wilt thou do? Thou wilt not murder me? Help, ho!' },
    { speaker: 'POLONIUS', text: 'What ho! Help!' },
    { speaker: 'HAMLET', text: 'How now, a rat? Dead for a ducat, dead.' },
    { speaker: 'POLONIUS', text: 'O, I am slain!' },
    { speaker: 'QUEEN', text: 'O me, what hast thou done?' },
    { speaker: 'HAMLET', text: 'Nay, I know not. Is it the King?' },
    { speaker: 'QUEEN', text: 'O, what a rash and bloody deed is this!' },
    { speaker: 'HAMLET', text: 'A bloody deed—almost as bad, good mother, As kill a king and marry with his brother.' },
    { speaker: 'QUEEN', text: 'As kill a king?' },
    { speaker: 'HAMLET', text: 'Ay, lady, it was my word.' }
];

let currentLineIndex = 0;
let currentLevel = generateLevel();
currentLevel.par = 18;

function broadcastState() {
    io.emit('state-update', {
        currentIndex: currentLineIndex,
        currentLine: scriptLines[currentLineIndex] || null,
        totalLines: scriptLines.length,
        isFinished: currentLineIndex >= scriptLines.length,
        level: currentLevel
    });
}

// Client connects
io.on('connection', (socket) => {
    console.log(`Client connected: ${socket.id}`);
    
    // Send immediate state
    socket.emit('state-update', {
        currentIndex: currentLineIndex,
        currentLine: scriptLines[currentLineIndex] || null,
        totalLines: scriptLines.length,
        isFinished: currentLineIndex >= scriptLines.length,
        level: currentLevel
    });

    socket.on('disconnect', () => {
        console.log(`Client disconnected: ${socket.id}`);
    });
});

// Reset scene
app.post('/api/reset', (req, res) => {
    currentLineIndex = 0;
    currentLevel = generateLevel();
    currentLevel.par = 18;
    broadcastState();
    res.json({ success: true });
});

// Process a turn (can still be REST, but we broadcast the result via Socket.io)
app.post('/api/turn', async (req, res) => {
    if (currentLineIndex >= scriptLines.length) {
        return res.status(400).json({ error: 'Scene is over.' });
    }

    const audioBytes = req.body;
    const { wpmDelta } = req.query;
    
    const currentLine = scriptLines[currentLineIndex];
    const playerRole = currentLine.speaker;
    const expectedText = currentLine.text;

    try {
        // 1. Transcribe via Python HTTP service
        const pyRes = await fetch('http://localhost:5000/transcribe', {
            method: 'POST',
            body: audioBytes
        });
        const pyData = await pyRes.json();
        const text = pyData.text;
        const actualPauseDuration = pyData.pauseDuration || 0;
        const volume = pyData.volume || 0.0;
        
        console.log(`[Turn] ${playerRole} Heard: ${text} | Pauses: ${actualPauseDuration.toFixed(2)}s | Vol: ${volume.toFixed(4)}`);

        // 2. Scores
        let scores = { semanticScore: 0, volatilityScore: 0, desireScore: 0, disgustScore: 0, burdenScore: 0 };

        // 3. Compile DSL (Dominant Force)
        const commands = evaluateVocalInput(
            playerRole,
            expectedText,
            text, 
            scores, 
            actualPauseDuration, 
            parseFloat(wpmDelta || 0),
            volume
        );

        logEvent('session_turn', 'turn_processed', { role: playerRole, expectedText, text, commands });

        // Apply commands to server state
        commands.forEach(cmd => {
            const hMech = playerRole === 'HAMLET' ? cmd.action : null;
            const gMech = playerRole === 'QUEEN' ? cmd.action : null;
            simulateTurn(currentLevel.entities, hMech, gMech);
        });

        // Advance line
        currentLineIndex++;
        
        // Auto-advance past Polonius lines
        while (currentLineIndex < scriptLines.length && scriptLines[currentLineIndex].speaker === 'POLONIUS') {
            currentLineIndex++;
        }

        // Broadcast to ALL connected clients so both players see the physics happen at the same time
        io.emit('turn-result', {
            text: text,
            commands: commands,
            nextLineIndex: currentLineIndex
        });

        broadcastState();

        // Send standard response to the client that initiated the request
        res.json({ success: true });

    } catch (err) {
        console.error('Turn processing error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// Trigger a CPU turn
app.post('/api/cpu-turn', (req, res) => {
    if (currentLineIndex >= scriptLines.length) {
        return res.status(400).json({ error: 'Scene is over.' });
    }

    const currentLine = scriptLines[currentLineIndex];
    const playerRole = currentLine.speaker;
    const expectedText = currentLine.text;

    // Simulate realistic acoustic parameters for the CPU
    const text = expectedText; // 0 Deviation (CPU has perfect memory)
    const actualPauseDuration = Math.random() * 1.5; // Random pauses up to 1.5s
    const volume = 0.02 + (Math.random() * 0.06); // Moderate volume
    const wpmDelta = (Math.random() * 60) - 30; // Minor pacing shifts

    let scores = { semanticScore: 0, volatilityScore: 0, desireScore: 0, disgustScore: 0, burdenScore: 0 };
    
    const commands = evaluateVocalInput(
        playerRole, expectedText, text, scores, actualPauseDuration, wpmDelta, volume
    );

    logEvent('session_turn', 'cpu_turn_processed', { role: playerRole, commands });

    // Apply commands to server state
    commands.forEach(cmd => {
        const hMech = playerRole === 'HAMLET' ? cmd.action : null;
        const gMech = playerRole === 'QUEEN' ? cmd.action : null;
        simulateTurn(currentLevel.entities, hMech, gMech);
    });

    currentLineIndex++;
    while (currentLineIndex < scriptLines.length && scriptLines[currentLineIndex].speaker === 'POLONIUS') {
        currentLineIndex++;
    }

    io.emit('turn-result', {
        text: `[CPU AI]: ${text}`,
        commands: commands,
        nextLineIndex: currentLineIndex
    });

    broadcastState();

    res.json({ success: true });
});

const PORT = 3001;
server.listen(PORT, () => {
    console.log(`Networked Backend Orchestrator running on port ${PORT}`);
});
