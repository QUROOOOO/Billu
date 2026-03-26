const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const Matter = require('matter-js');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const app = express();
const server = http.createServer(app);
const IS_PROD = process.env.NODE_ENV === 'production';
const io = new Server(server, {
    cors: IS_PROD ? {} : { origin: '*' },
    pingInterval: 10000,
    pingTimeout: 5000,
    maxHttpBufferSize: 1e5 // 100KB max socket payload
});

// ─── Security Middleware ─────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false })); // CSP off for inline scripts
app.use(express.json({ limit: '10kb' })); // Prevent large payload attacks
app.use(express.static(path.join(__dirname, 'public'), { maxAge: IS_PROD ? '1d' : 0 }));

// Rate limit auth endpoints
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 min
    max: 20,                   // 20 attempts per window
    message: { success: false, error: 'Too many attempts, try again later' },
    standardHeaders: true,
    legacyHeaders: false
});

// ─── Input Sanitization ─────────────────────────────────────
function sanitize(str, maxLen = 24) {
    if (typeof str !== 'string') return '';
    return str.replace(/[^a-zA-Z0-9_\-. ]/g, '').trim().slice(0, maxLen);
}
function isValidUsername(u) { return typeof u === 'string' && /^[a-zA-Z0-9_]{2,20}$/.test(u); }
function isValidPassword(p) { return typeof p === 'string' && p.length >= 4 && p.length <= 128; }

// ─── Data Store ──────────────────────────────────────────────
const DATA_DIR = path.join(__dirname, 'data');
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

// ─── Auth ────────────────────────────────────────────────────
app.post('/api/signup', authLimiter, (req, res) => {
    const { username, password } = req.body || {};
    if (!isValidUsername(username)) return res.json({ success: false, error: 'Username must be 2-20 alphanumeric characters' });
    if (!isValidPassword(password)) return res.json({ success: false, error: 'Password must be 4-128 characters' });
    if (users[username]) return res.json({ success: false, error: 'Username taken' });
    const hash = crypto.createHash('sha256').update(password).digest('hex');
    const token = crypto.randomBytes(16).toString('hex');
    users[username] = { hash, token, groups: [] };
    saveJSON('users.json', users);
    res.json({ success: true, token, username });
});

app.post('/api/login', authLimiter, (req, res) => {
    const { username, password } = req.body || {};
    if (!isValidUsername(username) || !isValidPassword(password))
        return res.json({ success: false, error: 'Invalid credentials' });
    const hash = crypto.createHash('sha256').update(password).digest('hex');
    const user = users[username];
    if (!user || user.hash !== hash) return res.json({ success: false, error: 'Invalid credentials' });
    user.token = crypto.randomBytes(16).toString('hex');
    saveJSON('users.json', users);
    res.json({ success: true, token: user.token, username });
});

// ─── Physics Constants (Portrait) ────────────────────────────
const GAME_W = 420, GAME_H = 780;
const TBL_L = 40, TBL_R = 380, TBL_T = 100, TBL_B = 720;
const TBL_H = TBL_B - TBL_T;
const CX = (TBL_L + TBL_R) / 2;
const BALL_R = 9;
const POCKET_R = 19;

const POCKET_POS = [
    { x: TBL_L, y: TBL_T },
    { x: CX, y: TBL_T - 4 },
    { x: TBL_R, y: TBL_T },
    { x: TBL_L, y: TBL_B },
    { x: CX, y: TBL_B + 4 },
    { x: TBL_R, y: TBL_B },
];

const RACK_ORDER = [1, 11, 2, 6, 8, 13, 14, 3, 10, 15, 4, 12, 5, 7, 9];

// ─── Room Management ─────────────────────────────────────────
const rooms = new Map();
const socketToUser = new Map();
const userToSocket = new Map();
const socketToRoom = new Map();

function genCode() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function createPhysicsRoom() {
    const { Engine, World, Bodies, Body, Events } = Matter;

    const engine = Engine.create({
        positionIterations: 30,
        velocityIterations: 30,
        gravity: { x: 0, y: 0, scale: 0 }
    });

    const cushionOpts = { isStatic: true, restitution: 0.85, friction: 0.03, label: 'cushion' };
    const cw = 14;

    const cushions = [
        Bodies.rectangle(CX, TBL_T - cw / 2, (TBL_R - TBL_L) - POCKET_R * 4, cw, cushionOpts),
        Bodies.rectangle(CX, TBL_B + cw / 2, (TBL_R - TBL_L) - POCKET_R * 4, cw, cushionOpts),
        Bodies.rectangle(TBL_L - cw / 2, (TBL_T + (TBL_T + TBL_B) / 2) / 2, cw, TBL_H / 2 - POCKET_R * 2.5, cushionOpts),
        Bodies.rectangle(TBL_L - cw / 2, ((TBL_T + TBL_B) / 2 + TBL_B) / 2, cw, TBL_H / 2 - POCKET_R * 2.5, cushionOpts),
        Bodies.rectangle(TBL_R + cw / 2, (TBL_T + (TBL_T + TBL_B) / 2) / 2, cw, TBL_H / 2 - POCKET_R * 2.5, cushionOpts),
        Bodies.rectangle(TBL_R + cw / 2, ((TBL_T + TBL_B) / 2 + TBL_B) / 2, cw, TBL_H / 2 - POCKET_R * 2.5, cushionOpts),
    ];
    World.add(engine.world, cushions);

    const pockets = POCKET_POS.map((p, i) =>
        Bodies.circle(p.x, p.y, POCKET_R, { isStatic: true, isSensor: true, label: 'pocket_' + i })
    );
    World.add(engine.world, pockets);

    const ballOpts = { restitution: 0.98, frictionAir: 0.001, density: 0.01, friction: 0.005 };
    const balls = [];

    balls.push(Bodies.circle(CX, 575, BALL_R, { ...ballOpts, label: 'ball_0' }));

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
            balls.push(Bodies.circle(bx, ry, BALL_R, { ...ballOpts, label: 'ball_' + bNum }));
        }
    }
    World.add(engine.world, balls);

    Events.on(engine, 'beforeUpdate', () => {
        balls.forEach(b => { if (b.speed > 50) Matter.Body.setSpeed(b, 50); });
    });

    return { engine, balls, pockets, cushions, pocketed: new Set(), settled: true };
}

function createRoom(code, hostId, hostName, isAI, aiDifficulty) {
    const physics = createPhysicsRoom();
    const room = {
        code,
        players: [{ id: hostId, name: hostName }],
        physics,
        currentTurn: 0,
        phase: 'waiting',
        assignments: [null, null],
        assignmentDone: false,
        intervalId: null,
        _prevPocketed: new Set(),
        isAI: !!isAI,
        aiDifficulty: aiDifficulty || 'medium',
        aiTurnTimeout: null
    };

    if (isAI) {
        room.players.push({ id: 'AI', name: 'AI Bot' });
        room.phase = 'aiming';
        room.currentTurn = 0;
        startGameLoop(room);
    }

    rooms.set(code, room);
    return room;
}

function startGameLoop(room) {
    const TICK = 1000 / 60;
    const SUB = 6;

    room.intervalId = setInterval(() => {
        for (let s = 0; s < SUB; s++) {
            Matter.Engine.update(room.physics.engine, TICK / SUB);
        }

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

        if (room.phase === 'settling') {
            const allStopped = balls.every((b, i) =>
                pocketed.has(i) || b.speed < 0.08
            );
            if (allStopped) processSettled(room);
        }

        const state = balls.map((b, i) => ({
            x: b.position.x, y: b.position.y, a: b.angle,
            p: pocketed.has(i), n: parseInt(b.label.split('_')[1])
        }));

        io.to(room.code).emit('gameState', {
            balls: state,
            turn: room.currentTurn,
            phase: room.phase,
            players: room.players.map(p => p.name),
            assignments: room.assignments,
            pocketed: [...pocketed]
        });
    }, TICK);
}

function processSettled(room) {
    const { pocketed } = room.physics;
    const prevPocketed = room._prevPocketed || new Set();
    const newlyPocketed = [...pocketed].filter(i => !prevPocketed.has(i));
    room._prevPocketed = new Set(pocketed);

    let foul = false;
    let switchTurn = true;

    if (pocketed.has(0)) {
        foul = true;
        pocketed.delete(0);
        const cue = room.physics.balls[0];
        Matter.Body.setStatic(cue, false);
        Matter.Body.setPosition(cue, { x: CX, y: 575 });
        Matter.Body.setVelocity(cue, { x: 0, y: 0 });
        Matter.Body.setAngularVelocity(cue, 0);
    }

    if (!room.assignmentDone && !foul) {
        for (const idx of newlyPocketed) {
            if (idx === 0) continue;
            const num = parseInt(room.physics.balls[idx].label.split('_')[1]);
            if (num >= 1 && num <= 7) {
                room.assignments[room.currentTurn] = 'solids';
                room.assignments[1 - room.currentTurn] = 'stripes';
                room.assignmentDone = true; break;
            } else if (num >= 9 && num <= 15) {
                room.assignments[room.currentTurn] = 'stripes';
                room.assignments[1 - room.currentTurn] = 'solids';
                room.assignmentDone = true; break;
            }
        }
    }

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

    const eightPocketed = newlyPocketed.some(idx => {
        const num = parseInt(room.physics.balls[idx].label.split('_')[1]);
        return num === 8;
    });
    if (eightPocketed) {
        const shooter = room.currentTurn;
        const myType = room.assignments[shooter];
        const myBalls = myType === 'solids' ? [1,2,3,4,5,6,7] : [9,10,11,12,13,14,15];
        const allCleared = myBalls.every(n => {
            const bi = room.physics.balls.findIndex(b => b.label === 'ball_' + n);
            return pocketed.has(bi);
        });
        if (allCleared && !foul) {
            io.to(room.code).emit('gameOver', { winner: room.players[shooter].name, reason: 'Pocketed 8-ball legally!' });
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

    // Trigger AI turn if it's the AI's turn
    if (room.isAI && room.currentTurn === 1 && room.phase === 'aiming') {
        scheduleAIShot(room);
    }
}

// ─── AI Brain ────────────────────────────────────────────────
function scheduleAIShot(room) {
    const delay = room.aiDifficulty === 'hard' ? 800 : room.aiDifficulty === 'medium' ? 1200 : 1600;
    room.aiTurnTimeout = setTimeout(() => {
        if (room.phase !== 'aiming' || room.currentTurn !== 1) return;
        const shot = calculateAIShot(room);
        if (shot) {
            const cue = room.physics.balls[0];
            const fx = Math.cos(shot.angle) * shot.force;
            const fy = Math.sin(shot.angle) * shot.force;
            Matter.Body.applyForce(cue, cue.position, { x: fx, y: fy });
            room.phase = 'settling';
        }
    }, delay);
}

function calculateAIShot(room) {
    const { balls, pocketed } = room.physics;
    const cue = balls[0];
    if (pocketed.has(0)) return null;

    // Determine which balls the AI should target
    const aiType = room.assignments[1]; // AI is player index 1
    let targetNums;
    if (!room.assignmentDone) {
        // Target any ball
        targetNums = [1,2,3,4,5,6,7,9,10,11,12,13,14,15];
    } else if (aiType === 'solids') {
        // Check if all solids pocketed, then go for 8
        const solidsLeft = [1,2,3,4,5,6,7].filter(n => {
            const bi = balls.findIndex(b => b.label === 'ball_' + n);
            return bi >= 0 && !pocketed.has(bi);
        });
        targetNums = solidsLeft.length > 0 ? solidsLeft : [8];
    } else {
        const stripesLeft = [9,10,11,12,13,14,15].filter(n => {
            const bi = balls.findIndex(b => b.label === 'ball_' + n);
            return bi >= 0 && !pocketed.has(bi);
        });
        targetNums = stripesLeft.length > 0 ? stripesLeft : [8];
    }

    // Find best shot: target ball + pocket combo with shortest/clearest path
    let bestShot = null;
    let bestScore = Infinity;

    for (const num of targetNums) {
        const bi = balls.findIndex(b => b.label === 'ball_' + num);
        if (bi < 0 || pocketed.has(bi)) continue;
        const target = balls[bi];

        for (const pocket of POCKET_POS) {
            // Angle from target ball to pocket
            const tpAngle = Math.atan2(pocket.y - target.position.y, pocket.x - target.position.x);
            // Ghost ball position: where cue ball must hit target to send it toward pocket
            const ghostX = target.position.x - Math.cos(tpAngle) * (BALL_R * 2);
            const ghostY = target.position.y - Math.sin(tpAngle) * (BALL_R * 2);
            // Angle from cue ball to ghost position
            const shotAngle = Math.atan2(ghostY - cue.position.y, ghostX - cue.position.x);
            // Distance from cue to ghost
            const dist = Math.sqrt(
                (ghostX - cue.position.x) ** 2 + (ghostY - cue.position.y) ** 2
            );
            // Distance from target to pocket
            const tpDist = Math.sqrt(
                (pocket.x - target.position.x) ** 2 + (pocket.y - target.position.y) ** 2
            );

            // Simple obstruction check: see if any other ball is near the line cue→ghost
            let obstructed = false;
            for (let k = 0; k < balls.length; k++) {
                if (k === 0 || k === bi || pocketed.has(k)) continue;
                const ob = balls[k];
                const d = pointToLineDist(
                    cue.position.x, cue.position.y, ghostX, ghostY,
                    ob.position.x, ob.position.y
                );
                if (d < BALL_R * 2.2) { obstructed = true; break; }
            }

            const score = dist + tpDist + (obstructed ? 9999 : 0);
            if (score < bestScore) {
                bestScore = score;
                bestShot = { angle: shotAngle, dist, tpDist, obstructed };
            }
        }
    }

    if (!bestShot) {
        // Desperation: hit a random ball
        const angle = Math.random() * Math.PI * 2;
        return { angle, force: 0.06 };
    }

    // Apply error margin based on difficulty
    let errorVariance, powerScale;
    switch (room.aiDifficulty) {
        case 'easy':
            errorVariance = (Math.random() - 0.5) * 0.55; // ~31 degrees max error
            powerScale = 0.3 + Math.random() * 0.25;
            break;
        case 'medium':
            errorVariance = (Math.random() - 0.5) * 0.2; // ~11 degrees max error
            powerScale = 0.35 + Math.random() * 0.3;
            break;
        case 'hard':
            errorVariance = bestShot.obstructed ? (Math.random() - 0.5) * 0.15 : (Math.random() - 0.5) * 0.04;
            powerScale = 0.4 + Math.random() * 0.25;
            break;
        default:
            errorVariance = (Math.random() - 0.5) * 0.3;
            powerScale = 0.35;
    }

    const finalAngle = bestShot.angle + errorVariance;
    const force = Math.min(powerScale * 0.15, 0.15);
    return { angle: finalAngle, force };
}

function pointToLineDist(x1, y1, x2, y2, px, py) {
    const A = px - x1, B = py - y1;
    const C = x2 - x1, D = y2 - y1;
    const dot = A * C + B * D;
    const lenSq = C * C + D * D;
    let t = lenSq !== 0 ? dot / lenSq : -1;
    t = Math.max(0, Math.min(1, t));
    const xx = x1 + t * C, yy = y1 + t * D;
    return Math.sqrt((px - xx) ** 2 + (py - yy) ** 2);
}

function stopRoom(code) {
    const room = rooms.get(code);
    if (!room) return;
    if (room.intervalId) clearInterval(room.intervalId);
    if (room.aiTurnTimeout) clearTimeout(room.aiTurnTimeout);
    Matter.World.clear(room.physics.engine.world);
    Matter.Engine.clear(room.physics.engine);
    rooms.delete(code);
}

// ─── Socket.io ───────────────────────────────────────────────
io.on('connection', (socket) => {
    console.log('Connected:', socket.id);

    socket.on('identify', (data) => {
        if (!data || typeof data !== 'object') return;
        const username = sanitize(data.username, 20);
        const token = typeof data.token === 'string' ? data.token.slice(0, 64) : '';
        const user = users[username];
        if (!user || user.token !== token) return socket.emit('authError', 'Invalid session');
        socketToUser.set(socket.id, username);
        userToSocket.set(username, socket.id);
        broadcastPresence();
    });

    // ─── Host / Join / AI ────────────────────────────────────
    socket.on('hostRoom', () => {
        const username = socketToUser.get(socket.id);
        if (!username) return;
        const code = genCode();
        createRoom(code, socket.id, username, false);
        socket.join(code);
        socketToRoom.set(socket.id, code);
        socket.emit('roomCreated', { code });
    });

    socket.on('joinRoom', (data) => {
        const username = socketToUser.get(socket.id);
        if (!username || !data || typeof data.code !== 'string') return;
        const code = data.code.replace(/[^A-Z0-9]/gi, '').slice(0, 8).toUpperCase();
        const room = rooms.get(code);
        if (!room) return socket.emit('joinError', 'Room not found');
        if (room.players.length >= 2) return socket.emit('joinError', 'Room is full');
        room.players.push({ id: socket.id, name: username });
        socket.join(code);
        socketToRoom.set(socket.id, code);
        room.phase = 'aiming';
        room.currentTurn = 0;
        room._prevPocketed = new Set();
        startGameLoop(room);
        io.to(code).emit('gameStarted', { players: room.players.map(p => p.name) });
    });

    socket.on('startAI', (data) => {
        const username = socketToUser.get(socket.id);
        if (!username) return;
        if (socketToRoom.has(socket.id)) return; // prevent double-room
        const validDiffs = ['easy', 'medium', 'hard'];
        const difficulty = (data && validDiffs.includes(data.difficulty)) ? data.difficulty : 'medium';
        const code = genCode();
        const room = createRoom(code, socket.id, username, true, difficulty);
        socket.join(code);
        socketToRoom.set(socket.id, code);
        socket.emit('gameStarted', { players: [username, 'AI Bot'] });
    });

    // ─── Shoot ───────────────────────────────────────────────
    socket.on('shoot', (data) => {
        if (!data || typeof data.force !== 'number' || typeof data.angle !== 'number') return;
        const code = socketToRoom.get(socket.id);
        if (!code) return;
        const room = rooms.get(code);
        if (!room || room.phase !== 'aiming') return;
        const pIdx = room.players.findIndex(p => p.id === socket.id);
        if (pIdx !== room.currentTurn) return;

        const clampedForce = Math.max(0, Math.min(Number(data.force) || 0, 1));
        const angle = Number(data.angle) || 0;
        const forceMag = clampedForce * 0.15;
        const fx = Math.cos(angle) * forceMag;
        const fy = Math.sin(angle) * forceMag;
        const cue = room.physics.balls[0];
        Matter.Body.applyForce(cue, cue.position, { x: fx, y: fy });
        room.phase = 'settling';
    });

    // ─── Ping ────────────────────────────────────────────────
    socket.on('pingEvent', (cb) => { if (typeof cb === 'function') cb(Date.now()); });

    // ─── Groups ──────────────────────────────────────────────
    socket.on('createGroup', (data) => {
        const username = socketToUser.get(socket.id);
        if (!username || !data) return;
        const name = sanitize(data.name, 30);
        if (!name || name.length < 1) return;
        const gid = crypto.randomBytes(4).toString('hex');
        groups[gid] = { name, members: [username], createdBy: username };
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
            id: gid, ...groups[gid],
            members: (groups[gid]?.members || []).map(m => ({ name: m, online: userToSocket.has(m) }))
        })).filter(g => g.name);
        socket.emit('groupsList', userGroups);
    });

    socket.on('joinGroup', (data) => {
        const username = socketToUser.get(socket.id);
        if (!username || !data || typeof data.id !== 'string') return;
        const gid = data.id.replace(/[^a-f0-9]/gi, '').slice(0, 16);
        if (!groups[gid]) return;
        if (!groups[gid].members.includes(username)) {
            groups[gid].members.push(username);
            if (!users[username].groups) users[username].groups = [];
            users[username].groups.push(gid);
            saveJSON('groups.json', groups);
            saveJSON('users.json', users);
        }
        socket.emit('groupJoined', { id: gid, group: groups[gid] });
        broadcastPresence();
    });

    socket.on('groupInvite', (data) => {
        const username = socketToUser.get(socket.id);
        if (!username || !groups[data.groupId]) return;
        const code = genCode();
        createRoom(code, socket.id, username, false);
        socket.join(code);
        socketToRoom.set(socket.id, code);
        groups[data.groupId].members.forEach(m => {
            if (m !== username && userToSocket.has(m)) {
                io.to(userToSocket.get(m)).emit('matchInvite', { from: username, code, groupName: groups[data.groupId].name });
            }
        });
        socket.emit('roomCreated', { code });
    });

    // ─── Disconnect ──────────────────────────────────────────
    socket.on('disconnect', () => {
        const username = socketToUser.get(socket.id);
        const code = socketToRoom.get(socket.id);
        if (code) {
            const room = rooms.get(code);
            if (room) {
                room.players = room.players.filter(p => p.id !== socket.id);
                if (room.players.length === 0 || (room.isAI && room.players.every(p => p.id === 'AI'))) stopRoom(code);
                else io.to(code).emit('playerLeft', { name: username });
            }
            socketToRoom.delete(socket.id);
        }
        socketToUser.delete(socket.id);
        if (username) userToSocket.delete(username);
        broadcastPresence();
    });
});

function broadcastPresence() {
    io.emit('presenceUpdate', [...userToSocket.keys()]);
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log('Billu server running on port ' + PORT));
