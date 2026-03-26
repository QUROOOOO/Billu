const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const Matter = require('matter-js');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// ─── Data Store ──────────────────────────────────────────────
const DATA_DIR = path.join(__dirname, '../data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

function loadJSON(file) {
    const p = path.join(DATA_DIR, file);
    if (!fs.existsSync(p)) return {};
    return JSON.parse(fs.readFileSync(p, 'utf8'));
}
function saveJSON(file, data) {
    fs.writeFileSync(path.join(DATA_DIR, file), JSON.stringify(data, null, 2));
}

let users = loadJSON('users.json');
let groups = loadJSON('groups.json');

// ─── Auth Endpoints ──────────────────────────────────────────
app.post('/api/signup', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.json({ success: false, error: 'Missing fields' });
    if (username.length < 2) return res.json({ success: false, error: 'Username too short' });
    if (users[username]) return res.json({ success: false, error: 'Username taken' });
    const hash = crypto.createHash('sha256').update(password).digest('hex');
    const token = crypto.randomBytes(16).toString('hex');
    users[username] = { hash, token, groups: [] };
    saveJSON('users.json', users);
    res.json({ success: true, token, username });
});

app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.json({ success: false, error: 'Missing fields' });
    const hash = crypto.createHash('sha256').update(password).digest('hex');
    const user = users[username];
    if (!user || user.hash !== hash) return res.json({ success: false, error: 'Invalid credentials' });
    user.token = crypto.randomBytes(16).toString('hex');
    saveJSON('users.json', users);
    res.json({ success: true, token: user.token, username });
});

// ─── Physics Constants (Portrait Table) ─────────────────────
const GAME_W = 420, GAME_H = 780;
const TBL_L = 40, TBL_R = 380, TBL_T = 100, TBL_B = 720;
const TBL_W = TBL_R - TBL_L;  // 340
const TBL_H = TBL_B - TBL_T;  // 620
const CX = (TBL_L + TBL_R) / 2; // 210
const BALL_R = 9;
const POCKET_R = 19;

const POCKET_POS = [
    { x: TBL_L, y: TBL_T },       // Top-left
    { x: CX, y: TBL_T - 4 },      // Top-center
    { x: TBL_R, y: TBL_T },       // Top-right
    { x: TBL_L, y: TBL_B },       // Bottom-left
    { x: CX, y: TBL_B + 4 },      // Bottom-center
    { x: TBL_R, y: TBL_B },       // Bottom-right
];

const BALL_COLORS_MAP = {
    0: 'cue', 1: 'solid', 2: 'solid', 3: 'solid', 4: 'solid',
    5: 'solid', 6: 'solid', 7: 'solid', 8: 'eight',
    9: 'stripe', 10: 'stripe', 11: 'stripe', 12: 'stripe',
    13: 'stripe', 14: 'stripe', 15: 'stripe'
};

const RACK_ORDER = [1, 11, 2, 6, 8, 13, 14, 3, 10, 15, 4, 12, 5, 7, 9];

// ─── Room Management ─────────────────────────────────────────
const rooms = new Map();
const socketToUser = new Map();   // socketId → username
const userToSocket = new Map();   // username → socketId
const socketToRoom = new Map();   // socketId → roomCode

function genCode() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function createPhysicsRoom(code) {
    const { Engine, World, Bodies, Body, Events } = Matter;

    const engine = Engine.create({
        positionIterations: 30,
        velocityIterations: 30,
        gravity: { x: 0, y: 0, scale: 0 }
    });

    const cushionOpts = { isStatic: true, restitution: 0.85, friction: 0.05, label: 'cushion' };
    const cw = 14; // cushion width

    const cushions = [
        // Top rail
        Bodies.rectangle(CX, TBL_T - cw / 2, TBL_W - POCKET_R * 4, cw, cushionOpts),
        // Bottom rail
        Bodies.rectangle(CX, TBL_B + cw / 2, TBL_W - POCKET_R * 4, cw, cushionOpts),
        // Left-upper rail
        Bodies.rectangle(TBL_L - cw / 2, (TBL_T + (TBL_T + TBL_B) / 2) / 2, cw, TBL_H / 2 - POCKET_R * 2.5, cushionOpts),
        // Left-lower rail
        Bodies.rectangle(TBL_L - cw / 2, ((TBL_T + TBL_B) / 2 + TBL_B) / 2, cw, TBL_H / 2 - POCKET_R * 2.5, cushionOpts),
        // Right-upper rail
        Bodies.rectangle(TBL_R + cw / 2, (TBL_T + (TBL_T + TBL_B) / 2) / 2, cw, TBL_H / 2 - POCKET_R * 2.5, cushionOpts),
        // Right-lower rail
        Bodies.rectangle(TBL_R + cw / 2, ((TBL_T + TBL_B) / 2 + TBL_B) / 2, cw, TBL_H / 2 - POCKET_R * 2.5, cushionOpts),
    ];
    World.add(engine.world, cushions);

    // Pocket sensors
    const pockets = POCKET_POS.map((p, i) =>
        Bodies.circle(p.x, p.y, POCKET_R, { isStatic: true, isSensor: true, label: `pocket_${i}` })
    );
    World.add(engine.world, pockets);

    // Balls
    const ballOpts = { restitution: 0.95, frictionAir: 0.002, density: 0.005, friction: 0.001 };
    const balls = [];

    // Cue ball
    balls.push(Bodies.circle(CX, 575, BALL_R, { ...ballOpts, label: 'ball_0' }));

    // Triangle rack
    const rackApexY = 300;
    const rowDy = BALL_R * 2 * Math.sqrt(3) / 2 + 0.5;
    const colDx = BALL_R * 2 + 0.5;
    let idx = 0;
    for (let row = 0; row < 5; row++) {
        const n = row + 1;
        const ry = rackApexY - row * rowDy;
        for (let col = 0; col < n; col++) {
            const bx = CX + (col - (n - 1) / 2) * colDx;
            const bNum = RACK_ORDER[idx++];
            balls.push(Bodies.circle(bx, ry, BALL_R, { ...ballOpts, label: `ball_${bNum}` }));
        }
    }
    World.add(engine.world, balls);

    // Speed cap for CCD safety
    Events.on(engine, 'beforeUpdate', () => {
        balls.forEach(b => { if (b.speed > 30) Matter.Body.setSpeed(b, 30); });
    });

    return { engine, balls, pockets, cushions, pocketed: new Set(), settled: true };
}

function createRoom(code, hostId, hostName) {
    const physics = createPhysicsRoom(code);
    const room = {
        code,
        players: [{ id: hostId, name: hostName }],
        physics,
        currentTurn: 0,
        phase: 'waiting',         // waiting | aiming | settling
        assignments: [null, null], // 'solids' | 'stripes'
        assignmentDone: false,
        intervalId: null
    };
    rooms.set(code, room);
    return room;
}

function startGameLoop(room) {
    const { Engine } = Matter;
    const TICK = 1000 / 60;
    const SUB = 4;

    room.intervalId = setInterval(() => {
        for (let s = 0; s < SUB; s++) {
            Engine.update(room.physics.engine, TICK / SUB);
        }

        // Pocket detection
        const { balls, pocketed } = room.physics;
        balls.forEach((b, i) => {
            if (pocketed.has(i)) return;
            POCKET_POS.forEach(p => {
                const dx = b.position.x - p.x;
                const dy = b.position.y - p.y;
                if (Math.sqrt(dx * dx + dy * dy) < POCKET_R - 2) {
                    pocketed.add(i);
                    Matter.Body.setPosition(b, { x: -200, y: -200 });
                    Matter.Body.setVelocity(b, { x: 0, y: 0 });
                    Matter.Body.setStatic(b, true);
                }
            });
        });

        // Check settling
        if (room.phase === 'settling') {
            const allStopped = balls.every((b, i) =>
                pocketed.has(i) || b.speed < 0.08
            );
            if (allStopped) {
                processSettled(room);
            }
        }

        // Broadcast state
        const state = balls.map((b, i) => ({
            x: b.position.x,
            y: b.position.y,
            a: b.angle,
            p: pocketed.has(i),
            n: parseInt(b.label.split('_')[1])
        }));

        const playerNames = room.players.map(p => p.name);
        io.to(room.code).emit('gameState', {
            balls: state,
            turn: room.currentTurn,
            phase: room.phase,
            players: playerNames,
            assignments: room.assignments,
            pocketed: [...pocketed]
        });
    }, TICK);
}

function processSettled(room) {
    const { pocketed } = room.physics;

    // Gather which balls were newly pocketed this shot
    const prevPocketed = room._prevPocketed || new Set();
    const newlyPocketed = [...pocketed].filter(i => !prevPocketed.has(i));
    room._prevPocketed = new Set(pocketed);

    let foul = false;
    let switchTurn = true;

    // Cue ball pocketed = scratch/foul
    if (pocketed.has(0)) {
        foul = true;
        // Reset cue ball
        pocketed.delete(0);
        const cue = room.physics.balls[0];
        Matter.Body.setStatic(cue, false);
        Matter.Body.setPosition(cue, { x: CX, y: 575 });
        Matter.Body.setVelocity(cue, { x: 0, y: 0 });
    }

    // Auto-assign groups on first legal pocket (non-foul)
    if (!room.assignmentDone && !foul) {
        for (const idx of newlyPocketed) {
            if (idx === 0) continue;
            const num = parseInt(room.physics.balls[idx].label.split('_')[1]);
            if (num >= 1 && num <= 7) {
                room.assignments[room.currentTurn] = 'solids';
                room.assignments[1 - room.currentTurn] = 'stripes';
                room.assignmentDone = true;
                break;
            } else if (num >= 9 && num <= 15) {
                room.assignments[room.currentTurn] = 'stripes';
                room.assignments[1 - room.currentTurn] = 'solids';
                room.assignmentDone = true;
                break;
            }
        }
    }

    // Did current player pocket one of their own?
    if (!foul && room.assignmentDone) {
        const myType = room.assignments[room.currentTurn];
        const pocketedOwn = newlyPocketed.some(idx => {
            if (idx === 0) return false;
            const num = parseInt(room.physics.balls[idx].label.split('_')[1]);
            if (myType === 'solids' && num >= 1 && num <= 7) return true;
            if (myType === 'stripes' && num >= 9 && num <= 15) return true;
            return false;
        });
        if (pocketedOwn) switchTurn = false;
    }

    // 8-ball logic
    const eightPocketed = newlyPocketed.some(idx => {
        const num = parseInt(room.physics.balls[idx].label.split('_')[1]);
        return num === 8;
    });
    if (eightPocketed) {
        const shooter = room.currentTurn;
        const myType = room.assignments[shooter];
        const myBalls = myType === 'solids' ? [1,2,3,4,5,6,7] : [9,10,11,12,13,14,15];
        const allCleared = myBalls.every(n => {
            const bi = room.physics.balls.findIndex(b => b.label === `ball_${n}`);
            return pocketed.has(bi);
        });
        if (allCleared && !foul) {
            io.to(room.code).emit('gameOver', { winner: room.players[shooter].name, reason: 'Pocketed 8-ball legally' });
        } else {
            io.to(room.code).emit('gameOver', { winner: room.players[1 - shooter].name, reason: foul ? 'Opponent scratched on 8-ball' : 'Opponent pocketed 8-ball early' });
        }
        room.phase = 'over';
        return;
    }

    if (foul) switchTurn = true;
    if (switchTurn && room.players.length === 2) {
        room.currentTurn = 1 - room.currentTurn;
    }
    room.phase = 'aiming';
}

function stopRoom(code) {
    const room = rooms.get(code);
    if (!room) return;
    if (room.intervalId) clearInterval(room.intervalId);
    Matter.World.clear(room.physics.engine.world);
    Matter.Engine.clear(room.physics.engine);
    rooms.delete(code);
}

// ─── Socket.io ───────────────────────────────────────────────
io.on('connection', (socket) => {
    console.log(`Socket connected: ${socket.id}`);

    // Identify user
    socket.on('identify', (data) => {
        const { username, token } = data;
        const user = users[username];
        if (!user || user.token !== token) {
            socket.emit('authError', 'Invalid session');
            return;
        }
        socketToUser.set(socket.id, username);
        userToSocket.set(username, socket.id);
        broadcastPresence();
    });

    // Host a game room
    socket.on('hostRoom', () => {
        const username = socketToUser.get(socket.id);
        if (!username) return;
        const code = genCode();
        const room = createRoom(code, socket.id, username);
        socket.join(code);
        socketToRoom.set(socket.id, code);
        socket.emit('roomCreated', { code });
    });

    // Join a game room
    socket.on('joinRoom', (data) => {
        const username = socketToUser.get(socket.id);
        if (!username) return;
        const room = rooms.get(data.code);
        if (!room) return socket.emit('joinError', 'Room not found');
        if (room.players.length >= 2) return socket.emit('joinError', 'Room is full');
        room.players.push({ id: socket.id, name: username });
        socket.join(data.code);
        socketToRoom.set(socket.id, data.code);
        room.phase = 'aiming';
        room.currentTurn = 0;
        room._prevPocketed = new Set();
        startGameLoop(room);
        io.to(data.code).emit('gameStarted', { players: room.players.map(p => p.name) });
    });

    // Shoot
    socket.on('shoot', (data) => {
        const code = socketToRoom.get(socket.id);
        if (!code) return;
        const room = rooms.get(code);
        if (!room || room.phase !== 'aiming') return;
        const pIdx = room.players.findIndex(p => p.id === socket.id);
        if (pIdx !== room.currentTurn) return;

        const forceMag = Math.min(data.force, 1) * 0.08;
        const fx = Math.cos(data.angle) * forceMag;
        const fy = Math.sin(data.angle) * forceMag;
        const cue = room.physics.balls[0];
        Matter.Body.applyForce(cue, cue.position, { x: fx, y: fy });
        room.phase = 'settling';
    });

    // Ping
    socket.on('pingEvent', (cb) => { if (typeof cb === 'function') cb(Date.now()); });

    // ─── Group Management ────────────────────────────────────
    socket.on('createGroup', (data) => {
        const username = socketToUser.get(socket.id);
        if (!username) return;
        const gid = crypto.randomBytes(4).toString('hex');
        groups[gid] = { name: data.name, members: [username], createdBy: username };
        if (!users[username].groups) users[username].groups = [];
        users[username].groups.push(gid);
        saveJSON('groups.json', groups);
        saveJSON('users.json', users);
        socket.emit('groupCreated', { id: gid, group: groups[gid] });
    });

    socket.on('getGroups', () => {
        const username = socketToUser.get(socket.id);
        if (!username) return;
        const userGroups = (users[username].groups || []).map(gid => ({
            id: gid,
            ...groups[gid],
            members: (groups[gid]?.members || []).map(m => ({
                name: m,
                online: userToSocket.has(m)
            }))
        })).filter(g => g.name);
        socket.emit('groupsList', userGroups);
    });

    socket.on('joinGroup', (data) => {
        const username = socketToUser.get(socket.id);
        if (!username || !groups[data.id]) return;
        if (!groups[data.id].members.includes(username)) {
            groups[data.id].members.push(username);
            if (!users[username].groups) users[username].groups = [];
            users[username].groups.push(data.id);
            saveJSON('groups.json', groups);
            saveJSON('users.json', users);
        }
        socket.emit('groupJoined', { id: data.id, group: groups[data.id] });
        broadcastPresence();
    });

    socket.on('groupInvite', (data) => {
        const username = socketToUser.get(socket.id);
        if (!username || !groups[data.groupId]) return;
        const code = genCode();
        const room = createRoom(code, socket.id, username);
        socket.join(code);
        socketToRoom.set(socket.id, code);

        // Notify all online group members
        groups[data.groupId].members.forEach(m => {
            if (m !== username && userToSocket.has(m)) {
                io.to(userToSocket.get(m)).emit('matchInvite', {
                    from: username,
                    code,
                    groupName: groups[data.groupId].name
                });
            }
        });
        socket.emit('roomCreated', { code });
    });

    // Disconnect
    socket.on('disconnect', () => {
        const username = socketToUser.get(socket.id);
        const code = socketToRoom.get(socket.id);

        if (code) {
            const room = rooms.get(code);
            if (room) {
                room.players = room.players.filter(p => p.id !== socket.id);
                if (room.players.length === 0) stopRoom(code);
                else io.to(code).emit('playerLeft', { name: username });
            }
            socketToRoom.delete(socket.id);
        }

        socketToUser.delete(socket.id);
        if (username) userToSocket.delete(username);
        broadcastPresence();
        console.log(`Socket disconnected: ${socket.id}`);
    });
});

function broadcastPresence() {
    // Send updated presence to anyone in groups
    const onlineUsers = [...userToSocket.keys()];
    io.emit('presenceUpdate', onlineUsers);
}

const PORT = 3000;
server.listen(PORT, () => console.log(`Billu server running on port ${PORT}`));
