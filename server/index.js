const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const { logEvent, db } = require('./db');
const { evaluateVocalInput } = require('./dsl-compiler');
const { simulateTurn, botGertrudeVigilant, botHamletTactical } = require('./bot-tester');
const { generateLevel } = require('./level-generator');
const path = require('path');

const app = express();
app.use(cors());

// Serve static React client files
app.use(express.static(path.join(__dirname, '../client/dist')));
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

/**
 * Loads a random evolved elite level from the SQLite database (populated by GA runner).
 * Falls back to procedural generator if database has no stored levels.
 */
function loadRandomEliteLevel() {
    return new Promise((resolve) => {
        db.all("SELECT * FROM levels ORDER BY RANDOM() LIMIT 1", (err, rows) => {
            if (err || !rows || rows.length === 0) {
                console.log("[Level Loader] No evolved levels in database. Falling back to procedural generator.");
                const lvl = generateLevel();
                lvl.par = 18;
                return resolve(lvl);
            }
            try {
                const row = rows[0];
                const config = JSON.parse(row.config);
                config.par = row.par || 18;
                config.fitness = row.fitness;
                config.mapCell = row.map_cell;
                config.claustrophobia = row.claustrophobia;
                config.tacticalFriction = row.tactical_friction;
                console.log(`[Level Loader] Loaded evolved level ${config.id} (Fitness: ${row.fitness}, MAP Cell: ${row.map_cell})`);
                resolve(config);
            } catch (parseErr) {
                console.error("[Level Loader] Error parsing level config:", parseErr);
                const lvl = generateLevel();
                lvl.par = 18;
                resolve(lvl);
            }
        });
    });
}

// -----------------------------------------------------------------------------
// Multi-Room State Management
// -----------------------------------------------------------------------------
const rooms = new Map();

const SHAKESPEARE_WORDS = [
    'BARD', 'ELSI', 'ROSE', 'DUKE', 'YORK', 'CLAW', 'CROW', 'DEED',
    'RACK', 'TOMB', 'IRON', 'GILT', 'FOIL', 'GATE', 'PAGE', 'HELM',
    'DART', 'WOLF', 'LION', 'CORD', 'SEAL', 'FORT', 'MAID', 'PEER'
];

function generateRoomCode() {
    const available = SHAKESPEARE_WORDS.filter(w => !rooms.has(w));
    if (available.length > 0) {
        return available[Math.floor(Math.random() * available.length)];
    }
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    let code = '';
    do {
        code = '';
        for (let i = 0; i < 4; i++) {
            code += chars.charAt(Math.floor(Math.random() * chars.length));
        }
    } while (rooms.has(code));
    return code;
}

async function createRoom(code) {
    const level = await loadRandomEliteLevel();
    const room = {
        roomCode: code,
        currentLineIndex: 0,
        currentLevel: level,
        gertrudeDisarmCooldown: false,
        players: {
            HAMLET: null, // { socketId, token, connected }
            QUEEN: null
        },
        createdAt: Date.now(),
        lastActivity: Date.now()
    };
    rooms.set(code, room);
    return room;
}

async function getOrCreateRoom(code = 'DEFAULT') {
    const normalized = (code || 'DEFAULT').toUpperCase().trim();
    if (!rooms.has(normalized)) {
        await createRoom(normalized);
    }
    const r = rooms.get(normalized);
    r.lastActivity = Date.now();
    return r;
}

function getRoomState(room) {
    return {
        roomCode: room.roomCode,
        currentIndex: room.currentLineIndex,
        currentLine: scriptLines[room.currentLineIndex] || null,
        totalLines: scriptLines.length,
        isFinished: room.currentLineIndex >= scriptLines.length,
        level: room.currentLevel,
        players: {
            HAMLET: room.players.HAMLET ? {
                token: room.players.HAMLET.token,
                connected: !!room.players.HAMLET.connected
            } : null,
            QUEEN: room.players.QUEEN ? {
                token: room.players.QUEEN.token,
                connected: !!room.players.QUEEN.connected
            } : null
        }
    };
}

function broadcastRoomState(roomCode) {
    const room = rooms.get(roomCode);
    if (!room) return;
    const state = getRoomState(room);
    io.to(roomCode).emit('room-state-update', state);
    io.to(roomCode).emit('state-update', state); // backwards compatibility
}

// Initialize default chamber for backward compatibility
createRoom('DEFAULT').then(r => {
    console.log(`[Room Manager] Initialized default chamber 'DEFAULT'`);
});

// -----------------------------------------------------------------------------
// Socket.io Realtime Multi-Room Events
// -----------------------------------------------------------------------------
io.on('connection', (socket) => {
    console.log(`Client connected: ${socket.id}`);

    // If handshake included a room query, join it immediately
    const initialRoom = (socket.handshake.query?.room || '').toUpperCase().trim();
    if (initialRoom) {
        socket.join(initialRoom);
    }

    // 1. Create a brand new chamber
    socket.on('create-room', async ({ role, token }, callback) => {
        try {
            const roomCode = generateRoomCode();
            const room = await createRoom(roomCode);
            socket.join(roomCode);
            socket.roomCode = roomCode;
            socket.playerToken = token;

            const desiredRole = (role === 'QUEEN' || role === 'HAMLET') ? role : 'HAMLET';
            room.players[desiredRole] = { socketId: socket.id, token, connected: true };
            socket.playerRole = desiredRole;

            const state = getRoomState(room);
            broadcastRoomState(roomCode);
            if (typeof callback === 'function') {
                callback({ success: true, roomCode, role: desiredRole, state });
            }
        } catch (err) {
            console.error('Error creating room:', err);
            if (typeof callback === 'function') callback({ error: err.message });
        }
    });

    // 2. Join an existing chamber
    socket.on('join-room', async ({ roomCode, token }, callback) => {
        try {
            const code = (roomCode || '').toUpperCase().trim();
            if (!code) {
                if (typeof callback === 'function') callback({ error: 'Please specify a chamber code.' });
                return;
            }
            const room = await getOrCreateRoom(code);
            socket.join(code);
            socket.roomCode = code;
            socket.playerToken = token;

            // Reconnection check: if token already claimed a role in this chamber
            let assignedRole = null;
            if (token) {
                if (room.players.HAMLET && room.players.HAMLET.token === token) {
                    assignedRole = 'HAMLET';
                    room.players.HAMLET.socketId = socket.id;
                    room.players.HAMLET.connected = true;
                } else if (room.players.QUEEN && room.players.QUEEN.token === token) {
                    assignedRole = 'QUEEN';
                    room.players.QUEEN.socketId = socket.id;
                    room.players.QUEEN.connected = true;
                }
            }
            socket.playerRole = assignedRole;

            const state = getRoomState(room);
            broadcastRoomState(code);
            if (typeof callback === 'function') {
                callback({ success: true, roomCode: code, role: assignedRole, state });
            }
        } catch (err) {
            console.error('Error joining room:', err);
            if (typeof callback === 'function') callback({ error: err.message });
        }
    });

    // 3. Claim or switch a role in the current room
    socket.on('claim-role', ({ roomCode, role, token }, callback) => {
        try {
            const code = (roomCode || socket.roomCode || '').toUpperCase().trim();
            const room = rooms.get(code);
            if (!room) {
                if (typeof callback === 'function') callback({ error: 'Chamber not found.' });
                return;
            }

            const targetRole = role === 'QUEEN' ? 'QUEEN' : 'HAMLET';
            const existing = room.players[targetRole];

            // If already claimed by another distinct token and that player is still connected
            if (existing && existing.token !== token && existing.connected) {
                if (typeof callback === 'function') callback({ error: `The role of ${targetRole} is already claimed by your opponent.` });
                return;
            }

            // Remove player from other role if switching
            const otherRole = targetRole === 'HAMLET' ? 'QUEEN' : 'HAMLET';
            if (room.players[otherRole] && room.players[otherRole].token === token) {
                room.players[otherRole] = null;
            }

            room.players[targetRole] = { socketId: socket.id, token, connected: true };
            socket.playerRole = targetRole;
            socket.roomCode = code;
            socket.playerToken = token;

            const state = getRoomState(room);
            broadcastRoomState(code);
            if (typeof callback === 'function') {
                callback({ success: true, role: targetRole, state });
            }
        } catch (err) {
            console.error('Error claiming role:', err);
            if (typeof callback === 'function') callback({ error: err.message });
        }
    });

    // 4. Swap roles between the two players
    socket.on('swap-roles', async ({ roomCode }, callback) => {
        try {
            const code = (roomCode || socket.roomCode || '').toUpperCase().trim();
            const room = rooms.get(code);
            if (!room) {
                if (typeof callback === 'function') callback({ error: 'Chamber not found.' });
                return;
            }

            // Swap players
            const temp = room.players.HAMLET;
            room.players.HAMLET = room.players.QUEEN;
            room.players.QUEEN = temp;

            // Reset scene with fresh evolved level
            room.currentLineIndex = 0;
            room.currentLevel = await loadRandomEliteLevel();
            room.gertrudeDisarmCooldown = false;

            io.to(code).emit('roles-swapped', {
                hamletToken: room.players.HAMLET ? room.players.HAMLET.token : null,
                queenToken: room.players.QUEEN ? room.players.QUEEN.token : null
            });
            broadcastRoomState(code);

            if (typeof callback === 'function') callback({ success: true, state: getRoomState(room) });
        } catch (err) {
            console.error('Error swapping roles:', err);
            if (typeof callback === 'function') callback({ error: err.message });
        }
    });

    // 5. Reset room (New Chamber, Keep Roles)
    socket.on('reset-room', async ({ roomCode }, callback) => {
        try {
            const code = (roomCode || socket.roomCode || '').toUpperCase().trim();
            const room = rooms.get(code);
            if (!room) {
                if (typeof callback === 'function') callback({ error: 'Chamber not found.' });
                return;
            }

            room.currentLineIndex = 0;
            room.currentLevel = await loadRandomEliteLevel();
            room.gertrudeDisarmCooldown = false;
            io.to(code).emit('room-reset');
            broadcastRoomState(code);

            if (typeof callback === 'function') callback({ success: true, state: getRoomState(room) });
        } catch (err) {
            console.error('Error resetting room:', err);
            if (typeof callback === 'function') callback({ error: err.message });
        }
    });

    // 6. Leave room / Return to playbill
    socket.on('leave-room', ({ roomCode, token }, callback) => {
        const code = (roomCode || socket.roomCode || '').toUpperCase().trim();
        const room = rooms.get(code);
        if (room && token) {
            if (room.players.HAMLET && room.players.HAMLET.token === token) room.players.HAMLET = null;
            if (room.players.QUEEN && room.players.QUEEN.token === token) room.players.QUEEN = null;
            socket.leave(code);
            socket.playerRole = null;
            broadcastRoomState(code);
        }
        if (typeof callback === 'function') callback({ success: true });
    });

    // 7. Disconnection
    socket.on('disconnect', () => {
        console.log(`Client disconnected: ${socket.id}`);
        if (socket.roomCode && rooms.has(socket.roomCode)) {
            const room = rooms.get(socket.roomCode);
            if (room.players.HAMLET && room.players.HAMLET.socketId === socket.id) {
                room.players.HAMLET.connected = false;
            }
            if (room.players.QUEEN && room.players.QUEEN.socketId === socket.id) {
                room.players.QUEEN.connected = false;
            }
            broadcastRoomState(socket.roomCode);
        }
    });
});

// -----------------------------------------------------------------------------
// Turn Processing Engine (Room-Scoped & Authoritative)
// -----------------------------------------------------------------------------
async function handleTurnProcessing(req, res, roomCode) {
    const room = await getOrCreateRoom(roomCode);

    if (room.currentLineIndex >= scriptLines.length) {
        return res.status(400).json({ error: 'Scene is over.' });
    }

    const currentLine = scriptLines[room.currentLineIndex];
    const playerRole = currentLine.speaker;
    const expectedText = currentLine.text;

    // Optional turn enforcement check: if caller specifies role query
    const callerRole = req.query.role;
    if (callerRole && callerRole !== playerRole) {
        return res.status(403).json({ error: `Not your turn. Expected delivery from ${playerRole}.` });
    }

    const audioBytes = req.body;
    const { wpmDelta } = req.query;

    try {
        // 1. Transcribe via Python HTTP service
        const pyRes = await fetch('http://127.0.0.1:5000/transcribe', {
            method: 'POST',
            body: audioBytes
        });
        const pyData = await pyRes.json();
        const text = pyData.text || '';
        const actualPauseDuration = pyData.pauseDuration || 0;
        const volume = pyData.volume || 0.0;

        console.log(`[Turn | Room ${roomCode}] ${playerRole} Heard: "${text}" | Pauses: ${actualPauseDuration.toFixed(2)}s | Vol: ${volume.toFixed(4)}`);

        // 2. Scores
        let scores = { semanticScore: 0, volatilityScore: 0, desireScore: 0, disgustScore: 0, burdenScore: 0 };

        // 3. Compile Grounded Spoken DSL
        const commands = evaluateVocalInput(
            playerRole,
            expectedText,
            text,
            scores,
            actualPauseDuration,
            parseFloat(wpmDelta || 0),
            volume
        );
        const breakdown = commands.breakdown || (commands[0] && commands[0].meta && commands[0].meta.compilationBreakdown) || null;

        logEvent('session_turn', 'turn_processed', { roomCode, role: playerRole, expectedText, text, commands, breakdown });

        // Apply commands to room simulation state
        let poloniusKilled = false;
        commands.forEach(cmd => {
            const hCmd = playerRole === 'HAMLET' ? cmd : null;
            const gCmd = playerRole === 'QUEEN' ? cmd : null;
            const res = simulateTurn(room.currentLevel.entities, hCmd, gCmd, room);
            if (res && res.poloniusKilled) poloniusKilled = true;
        });

        // Advance line
        room.currentLineIndex++;

        // Auto-advance past Polonius lines (per aligned design)
        while (room.currentLineIndex < scriptLines.length && scriptLines[room.currentLineIndex].speaker === 'POLONIUS') {
            room.currentLineIndex++;
        }

        // Broadcast to all connected clients in this room
        io.to(roomCode).emit('turn-result', {
            text: text,
            commands: commands,
            breakdown: breakdown,
            poloniusKilled,
            nextLineIndex: room.currentLineIndex
        });

        broadcastRoomState(roomCode);

        res.json({ success: true, commands, breakdown, poloniusKilled, currentLineIndex: room.currentLineIndex });

    } catch (err) {
        console.error(`Turn processing error [Room ${roomCode}]:`, err.message);
        res.status(500).json({ error: err.message });
    }
}

async function handleCpuTurn(req, res, roomCode) {
    const room = await getOrCreateRoom(roomCode);
    if (room.currentLineIndex >= scriptLines.length) {
        return res.status(400).json({ error: 'Scene is over.' });
    }

    const currentLine = scriptLines[room.currentLineIndex];
    const playerRole = currentLine.speaker;
    const expectedText = currentLine.text;

    let commands = [];
    let breakdown = null;

    if (playerRole === 'QUEEN') {
        const cmd = botGertrudeVigilant(room.currentLevel.entities, room);
        if (cmd) {
            commands = [cmd];
            const chosenAction = cmd.action;
            const queenDrives = [
                { action: 'Barricade', target: 'furniture', metricName: 'Chamber Deliberation', rawMetric: 'Tactical Spatial Delay', normScore: chosenAction === 'Barricade' ? 0.85 : 0.25, threshold: 0.20 },
                { action: 'Repel', target: 'rapier', metricName: 'Regal Command (RMS)', rawMetric: 'Kinetic Pushback', normScore: chosenAction === 'Repel' ? 0.90 : 0.30, threshold: 0.50 },
                { action: 'Interpose', target: 'gertrude', metricName: 'Spatial Agility', rawMetric: 'Corridor Shielding', normScore: chosenAction === 'Interpose' ? 0.80 : 0.20, threshold: 0.20 },
                { action: 'Disarm', target: 'rapier', metricName: 'Blade Deflection', rawMetric: 'Evasive Deflection', normScore: chosenAction === 'Disarm' ? 0.75 : 0.15, threshold: 0.30 }
            ];
            const totalW = queenDrives.reduce((s, d) => s + d.normScore, 0);
            const drives = queenDrives.map(d => ({
                action: d.action,
                target: d.target,
                metricName: d.metricName,
                rawMetric: d.rawMetric,
                normScore: d.normScore,
                threshold: d.threshold,
                percentage: Math.round((d.normScore / totalW) * 100),
                isWinner: d.action === chosenAction
            }));
            const curSum = drives.reduce((s, d) => s + d.percentage, 0);
            if (curSum !== 100 && drives.length > 0) drives[0].percentage += (100 - curSum);

            let rationale = "";
            if (chosenAction === 'Barricade') {
                rationale = `CPU Queen identified Hamlet advancing on the corridor, selecting Barricade (${drives.find(d => d.action === 'Barricade')?.percentage}%) to slide heavy oak furnishings into his line of fire.`;
            } else if (chosenAction === 'Repel') {
                rationale = `CPU Queen detected Hamlet at point-blank range, triggering Repel (${drives.find(d => d.action === 'Repel')?.percentage}%) to physically knock the rapier back.`;
            } else if (chosenAction === 'Interpose') {
                rationale = `CPU Queen stepped swiftly between the blade and Polonius, executing Interpose (${drives.find(d => d.action === 'Interpose')?.percentage}%) to shield the royal chamber.`;
            } else {
                rationale = `CPU Queen caught the prince within striking distance, executing Disarm (${drives.find(d => d.action === 'Disarm')?.percentage}%) to deflect the rapier.`;
            }

            breakdown = { actor: 'QUEEN', winner: chosenAction, drives, rationale, timestamp: Date.now() };
            cmd.meta = cmd.meta || {};
            cmd.meta.compilationBreakdown = breakdown;
        }
    } else {
        const cmd = botHamletTactical(room.currentLevel.entities);
        if (cmd) {
            commands = [cmd];
            const chosenAction = cmd.action;
            const hamletDrives = [
                { action: 'Lunge', target: 'rapier', metricName: 'Resonant Volume (RMS)', rawMetric: 'High Kinetic Impetus', normScore: chosenAction === 'Lunge' ? 0.85 : 0.30, threshold: 0.25 },
                { action: 'Pierce', target: 'rapier', metricName: 'Dramatic Silence', rawMetric: 'Penetrative Focus', normScore: chosenAction === 'Pierce' ? 0.80 : 0.25, threshold: 0.25 },
                { action: 'Feint', target: 'rapier', metricName: 'Cadence Variation', rawMetric: 'Spatial Footwork', normScore: chosenAction === 'Feint' ? 0.75 : 0.20, threshold: 0.25 },
                { action: 'Fracture', target: 'arras', metricName: 'Script Deviation', rawMetric: 'Destructive Arc', normScore: chosenAction === 'Fracture' ? 0.80 : 0.15, threshold: 0.35 }
            ];
            const totalW = hamletDrives.reduce((s, d) => s + d.normScore, 0);
            const drives = hamletDrives.map(d => ({
                action: d.action,
                target: d.target,
                metricName: d.metricName,
                rawMetric: d.rawMetric,
                normScore: d.normScore,
                threshold: d.threshold,
                percentage: Math.round((d.normScore / totalW) * 100),
                isWinner: d.action === chosenAction
            }));
            const curSum = drives.reduce((s, d) => s + d.percentage, 0);
            if (curSum !== 100 && drives.length > 0) drives[0].percentage += (100 - curSum);

            let rationale = "";
            if (chosenAction === 'Lunge') {
                rationale = `CPU Hamlet calculated an open path, executing Lunge (${drives.find(d => d.action === 'Lunge')?.percentage}%) to surge forward with kinetic momentum.`;
            } else if (chosenAction === 'Pierce') {
                rationale = `CPU Hamlet detected a barricaded obstacle, executing Pierce (${drives.find(d => d.action === 'Pierce')?.percentage}%) to thrust through the obstruction.`;
            } else if (chosenAction === 'Feint') {
                rationale = `CPU Hamlet observed a blocked corridor, executing Feint (${drives.find(d => d.action === 'Feint')?.percentage}%) to maneuver vertically around defenses.`;
            } else {
                rationale = `CPU Hamlet attacked the hanging arras, executing Fracture (${drives.find(d => d.action === 'Fracture')?.percentage}%) to splinter the barrier.`;
            }

            breakdown = { actor: 'HAMLET', winner: chosenAction, drives, rationale, timestamp: Date.now() };
            cmd.meta = cmd.meta || {};
            cmd.meta.compilationBreakdown = breakdown;
        }
    }

    logEvent('session_turn', 'cpu_turn_processed', { roomCode, role: playerRole, commands, breakdown });

    let poloniusKilled = false;
    commands.forEach(cmd => {
        const hCmd = playerRole === 'HAMLET' ? cmd : null;
        const gCmd = playerRole === 'QUEEN' ? cmd : null;
        const simRes = simulateTurn(room.currentLevel.entities, hCmd, gCmd, room);
        if (simRes && simRes.poloniusKilled) poloniusKilled = true;
    });

    room.currentLineIndex++;
    while (room.currentLineIndex < scriptLines.length && scriptLines[room.currentLineIndex].speaker === 'POLONIUS') {
        room.currentLineIndex++;
    }

    io.to(roomCode).emit('turn-result', {
        text: `[CPU AI]: ${expectedText}`,
        commands: commands,
        breakdown: breakdown,
        poloniusKilled,
        nextLineIndex: room.currentLineIndex
    });

    broadcastRoomState(roomCode);
    res.json({ success: true, commands, breakdown, poloniusKilled, currentLineIndex: room.currentLineIndex });
}

// -----------------------------------------------------------------------------
// REST Endpoints
// -----------------------------------------------------------------------------

// Process player turn (room-scoped & legacy fallback)
app.post('/api/room/:roomCode/turn', (req, res) => {
    handleTurnProcessing(req, res, (req.params.roomCode || 'DEFAULT').toUpperCase());
});

app.post('/api/turn', (req, res) => {
    handleTurnProcessing(req, res, (req.query.room || 'DEFAULT').toUpperCase());
});

// CPU Turn (room-scoped & legacy fallback)
app.post('/api/room/:roomCode/cpu-turn', (req, res) => {
    handleCpuTurn(req, res, (req.params.roomCode || 'DEFAULT').toUpperCase());
});

app.post('/api/cpu-turn', (req, res) => {
    handleCpuTurn(req, res, (req.query.room || 'DEFAULT').toUpperCase());
});

// Reset room scene (room-scoped & legacy fallback)
app.post('/api/room/:roomCode/reset', async (req, res) => {
    const roomCode = (req.params.roomCode || 'DEFAULT').toUpperCase();
    const room = await getOrCreateRoom(roomCode);
    room.currentLineIndex = 0;
    room.currentLevel = await loadRandomEliteLevel();
    room.gertrudeDisarmCooldown = false;
    broadcastRoomState(roomCode);
    res.json({ success: true, level: room.currentLevel });
});

app.post('/api/reset', async (req, res) => {
    const roomCode = (req.query.room || 'DEFAULT').toUpperCase();
    const room = await getOrCreateRoom(roomCode);
    room.currentLineIndex = 0;
    room.currentLevel = await loadRandomEliteLevel();
    room.gertrudeDisarmCooldown = false;
    broadcastRoomState(roomCode);
    res.json({ success: true, level: room.currentLevel });
});

// Query room state
app.get('/api/room/:roomCode/state', async (req, res) => {
    const roomCode = (req.params.roomCode || 'DEFAULT').toUpperCase();
    const room = await getOrCreateRoom(roomCode);
    res.json(getRoomState(room));
});

// List all active chambers
app.get('/api/rooms', (req, res) => {
    const active = [];
    for (const [code, r] of rooms.entries()) {
        active.push({
            roomCode: code,
            lineIndex: r.currentLineIndex,
            hamletJoined: !!(r.players.HAMLET && r.players.HAMLET.connected),
            queenJoined: !!(r.players.QUEEN && r.players.QUEEN.connected),
            lastActivity: r.lastActivity
        });
    }
    res.json({ count: active.length, rooms: active });
});

// Query all evolved levels in the MAP-Elites archive
app.get('/api/levels', (req, res) => {
    db.all("SELECT id, par, fitness, claustrophobia, tactical_friction, map_cell, entropy_score, tension_score, counterplay_score FROM levels", (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ count: (rows || []).length, levels: rows || [] });
    });
});

// React SPA fallback
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../client/dist/index.html'));
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
    console.log(`Networked Backend Orchestrator running on port ${PORT}`);
});
