/* ═══════════════════════════════════════════════════════════
   BILLU – Client Script (High-Res Mobile-First, No Hover)
   ═══════════════════════════════════════════════════════════ */
const socket = io();

// ─── State ───────────────────────────────────────────────────
let currentUser = null;
let currentToken = null;
let phaserGame = null;

// ─── Constants ───────────────────────────────────────────────
const GAME_W = 420, GAME_H = 780;
const TBL_L = 40, TBL_R = 380, TBL_T = 100, TBL_B = 720;
const CX = 210;
const BALL_R = 9;
const POCKET_R = 19;
const MAX_DRAG = 160;
const POCKET_POS = [
    { x: TBL_L, y: TBL_T }, { x: CX, y: TBL_T - 4 }, { x: TBL_R, y: TBL_T },
    { x: TBL_L, y: TBL_B }, { x: CX, y: TBL_B + 4 }, { x: TBL_R, y: TBL_B }
];

const BALL_COLORS_HEX = [
    '#F0F0F0',  // 0: cue (white)
    '#F9C80E',  // 1: yellow
    '#1565C0',  // 2: blue
    '#E53935',  // 3: red
    '#6A1B9A',  // 4: purple
    '#EF6C00',  // 5: orange
    '#2E7D32',  // 6: green
    '#5D4037',  // 7: brown
    '#1A1A1A',  // 8: black
    '#F9C80E',  // 9: yellow stripe
    '#1565C0',  // 10: blue stripe
    '#E53935',  // 11: red stripe
    '#6A1B9A',  // 12: purple stripe
    '#EF6C00',  // 13: orange stripe
    '#2E7D32',  // 14: green stripe
    '#5D4037',  // 15: brown stripe
];

const BALL_CSS = BALL_COLORS_HEX.slice();

// ─── Screen Management ──────────────────────────────────────
function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(id).classList.add('active');
}

// ─── Auth ────────────────────────────────────────────────────
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        document.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active'));
        document.getElementById(btn.dataset.tab + '-form').classList.add('active');
    });
});

async function authAction(endpoint, user, pass) {
    const res = await fetch(endpoint, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: user.trim(), password: pass })
    }).then(r => r.json());
    if (res.success) enterLobby(res.username, res.token);
    else document.getElementById('auth-error').textContent = res.error;
}

document.getElementById('login-form').addEventListener('submit', (e) => {
    e.preventDefault();
    authAction('/api/login', document.getElementById('login-user').value, document.getElementById('login-pass').value);
});
document.getElementById('signup-form').addEventListener('submit', (e) => {
    e.preventDefault();
    authAction('/api/signup', document.getElementById('signup-user').value, document.getElementById('signup-pass').value);
});

function enterLobby(username, token) {
    currentUser = username;
    currentToken = token;
    document.getElementById('username-display').textContent = username;
    socket.emit('identify', { username, token });
    showScreen('lobby-screen');
}

// ─── Lobby ───────────────────────────────────────────────────
document.getElementById('host-btn').addEventListener('click', () => socket.emit('hostRoom'));

document.getElementById('join-btn').addEventListener('click', () => {
    document.getElementById('join-modal').classList.remove('hidden');
    document.getElementById('join-code-input').value = '';
    document.getElementById('join-error').textContent = '';
});
document.getElementById('join-cancel').addEventListener('click', () => document.getElementById('join-modal').classList.add('hidden'));
document.getElementById('join-submit').addEventListener('click', () => {
    const code = document.getElementById('join-code-input').value.trim().toUpperCase();
    if (code.length >= 4) socket.emit('joinRoom', { code });
});

// ─── AI Menu ─────────────────────────────────────────────────
document.getElementById('ai-btn').addEventListener('click', () => {
    document.getElementById('ai-menu').classList.remove('hidden');
});
document.getElementById('ai-cancel').addEventListener('click', () => {
    document.getElementById('ai-menu').classList.add('hidden');
});
document.querySelectorAll('.diff-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.getElementById('ai-menu').classList.add('hidden');
        socket.emit('startAI', { difficulty: btn.dataset.diff });
    });
});

// ─── Socket Events ───────────────────────────────────────────
socket.on('roomCreated', (data) => {
    document.getElementById('room-code-display').textContent = data.code;
    showScreen('room-screen');
});
socket.on('joinError', (msg) => { document.getElementById('join-error').textContent = msg; });
socket.on('gameStarted', (data) => {
    document.getElementById('join-modal').classList.add('hidden');
    startGame(data.players);
});

// Groups
document.getElementById('groups-btn').addEventListener('click', () => {
    socket.emit('getGroups');
    showScreen('group-screen');
});
document.getElementById('groups-back').addEventListener('click', () => showScreen('lobby-screen'));
document.getElementById('create-group-btn').addEventListener('click', () => {
    const name = document.getElementById('new-group-name').value.trim();
    if (name) { socket.emit('createGroup', { name }); document.getElementById('new-group-name').value = ''; }
});
document.getElementById('join-group-btn').addEventListener('click', () => {
    const id = document.getElementById('join-group-id').value.trim();
    if (id) { socket.emit('joinGroup', { id }); document.getElementById('join-group-id').value = ''; }
});
socket.on('groupCreated', () => socket.emit('getGroups'));
socket.on('groupJoined', () => socket.emit('getGroups'));

socket.on('groupsList', (list) => {
    const container = document.getElementById('group-list');
    container.innerHTML = '';
    list.forEach(g => {
        const card = document.createElement('div');
        card.className = 'group-card';
        let membersHTML = g.members.map(m =>
            '<div class="member-row"><span class="status-dot ' + (m.online ? 'online' : 'offline') + '"></span><span>' + m.name + '</span></div>'
        ).join('');
        card.innerHTML = '<h4>' + g.name + ' <small>ID: ' + g.id + '</small></h4>' +
            membersHTML +
            '<button class="play-now-btn" data-gid="' + g.id + '">Play Now</button>';
        container.appendChild(card);
    });
    container.querySelectorAll('.play-now-btn').forEach(btn => {
        btn.addEventListener('click', () => socket.emit('groupInvite', { groupId: btn.dataset.gid }));
    });
});

socket.on('presenceUpdate', () => {
    if (document.getElementById('group-screen').classList.contains('active')) socket.emit('getGroups');
});

// Match invite
socket.on('matchInvite', (data) => {
    const toast = document.getElementById('invite-toast');
    document.getElementById('invite-msg').textContent = data.from + ' invited you from ' + data.groupName + '!';
    toast.classList.remove('hidden');
    document.getElementById('invite-accept').onclick = () => { socket.emit('joinRoom', { code: data.code }); toast.classList.add('hidden'); };
    document.getElementById('invite-decline').onclick = () => toast.classList.add('hidden');
});

// Game over
socket.on('gameOver', (data) => {
    const overlay = document.getElementById('gameover-overlay');
    document.getElementById('gameover-title').textContent = data.winner === currentUser ? 'You Win!' : 'You Lose';
    document.getElementById('gameover-reason').textContent = data.reason;
    overlay.classList.remove('hidden');
});
document.getElementById('gameover-lobby').addEventListener('click', () => {
    document.getElementById('gameover-overlay').classList.add('hidden');
    if (phaserGame) { phaserGame.destroy(true); phaserGame = null; }
    showScreen('lobby-screen');
});

// Leave game
document.getElementById('exit-game-btn').addEventListener('click', () => {
    if (phaserGame) { phaserGame.destroy(true); phaserGame = null; }
    showScreen('lobby-screen');
});

// Mute toggle
let isMuted = false;
document.getElementById('mute-game-btn').addEventListener('click', (e) => {
    isMuted = !isMuted;
    const btn = e.currentTarget;
    if (isMuted) {
        btn.innerHTML = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M11 5L6 9H2v6h4l5 4V5z"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>';
        btn.style.color = 'var(--red)';
        if (phaserGame) phaserGame.sound.mute = true;
    } else {
        btn.innerHTML = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M11 5L6 9H2v6h4l5 4V5z M19 12h.01 M16 9h.01 M16 15h.01 M22 9h.01 M22 15h.01"/></svg>';
        btn.style.color = 'var(--text)';
        if (phaserGame) phaserGame.sound.mute = false;
    }
});

// Fullscreen
document.getElementById('fullscreen-btn').addEventListener('click', () => {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {});
    else document.exitFullscreen();
});

// Ping
setInterval(() => {
    const t = Date.now();
    socket.emit('pingEvent', () => { document.getElementById('ping-val').textContent = Date.now() - t; });
}, 2000);

// ═══════════════════════════════════════════════════════════
//  PHASER GAME — HIGH RESOLUTION
// ═══════════════════════════════════════════════════════════
let serverState = null;
let ballSprites = [];
let shadowSprites = [];
let aimGraphics = null;
let dragState = null;
let myPlayerIndex = -1;

socket.on('gameState', (state) => { serverState = state; });

function startGame(players) {
    myPlayerIndex = players.indexOf(currentUser);
    showScreen('game-screen');

    document.getElementById('p1-name').textContent = players[0] || 'P1';
    document.getElementById('p2-name').textContent = players[1] || 'P2';

    if (phaserGame) { phaserGame.destroy(true); phaserGame = null; }

    phaserGame = new Phaser.Game({
        type: Phaser.CANVAS,
        parent: 'game-container',
        scale: {
            mode: Phaser.Scale.FIT,
            autoCenter: Phaser.Scale.CENTER_BOTH,
            width: GAME_W,
            height: GAME_H
        },
        render: {
            antialias: true,
            pixelArt: false,
            roundPixels: false,
            resolution: window.devicePixelRatio || 1
        },
        scene: { preload: gamePreload, create: gameCreate, update: gameUpdate },
        transparent: true,
        fps: { target: 60, forceSetTimeOut: false }
    });
}

function gamePreload() {
    const TEX_SIZE = (BALL_R + 1) * 2;
    this.load.svg('table', 'assets/table.svg', { width: GAME_W, height: GAME_H });
    this.load.svg('cue_stick', 'assets/cue_stick.svg', { width: 14, height: 420 });
    for (let i = 0; i <= 15; i++) {
        this.load.svg('ball_' + i, 'assets/ball_' + i + '.svg', { width: TEX_SIZE, height: TEX_SIZE });
    }
}

function gameCreate() {
    const scene = this;
    const TEX_SIZE = (BALL_R + 1) * 2;
    const DISPLAY_SIZE = (BALL_R + 1) * 2;

    // ─── Table ───────────────────────────────────────────────
    scene.add.image(GAME_W / 2, GAME_H / 2, 'table');
    
    // ─── Cue Stick ───────────────────────────────────────────
    scene.cueSprite = scene.add.image(-100, -100, 'cue_stick').setOrigin(0.5, 0).setVisible(false).setDepth(10);

    // Shadow texture (soft gaussian-like)
    const sg = scene.make.graphics({ add: false });
    sg.fillStyle(0x000000, 0.15); sg.fillCircle(TEX_SIZE / 2 + 1, TEX_SIZE / 2 + 1, TEX_SIZE / 2 - 2);
    sg.fillStyle(0x000000, 0.25); sg.fillCircle(TEX_SIZE / 2, TEX_SIZE / 2, TEX_SIZE / 2 - 4);
    sg.generateTexture('shadow', TEX_SIZE, TEX_SIZE); sg.destroy();

    ballSprites = []; shadowSprites = [];
    const scale = 1;
    for (let i = 0; i < 16; i++) {
        const sh = scene.add.sprite(-100, -100, 'shadow').setScale(scale * 1.15).setAlpha(0.5);
        shadowSprites.push(sh);
    }
    for (let i = 0; i < 16; i++) {
        const sp = scene.add.sprite(-100, -100, 'ball_' + i).setScale(scale);
        ballSprites.push(sp);
    }

    aimGraphics = scene.add.graphics();

    // Power bar background + fill
    scene.powerBarBg = scene.add.rectangle(GAME_W - 25, GAME_H / 2, 12, 200, 0x222222, 0.6).setVisible(false);
    scene.powerBarFill = scene.add.rectangle(GAME_W - 25, GAME_H / 2 + 100, 10, 0, 0x22C55E).setOrigin(0.5, 1).setVisible(false);

    // ─── Touch Input ─────────────────────────────────────────
    scene.input.on('pointerdown', (ptr) => {
        if (!serverState || serverState.phase !== 'aiming') return;
        if (myPlayerIndex !== serverState.turn) return;
        const cue = serverState.balls[0];
        if (cue.p) return;
        dragState = { sx: ptr.worldX, sy: ptr.worldY, cx: cue.x, cy: cue.y };
    });

    scene.input.on('pointermove', (ptr) => {
        if (!dragState || !serverState) return;
        aimGraphics.clear();

        const dist = Phaser.Math.Distance.Between(dragState.sx, dragState.sy, ptr.worldX, ptr.worldY);
        const dragDist = Math.min(dist, MAX_DRAG);
        const dragAngle = Phaser.Math.Angle.Between(dragState.sx, dragState.sy, ptr.worldX, ptr.worldY);
        const shootAngle = dragAngle + Math.PI;

        // Aiming line with dotted segments
        const dx = Math.cos(shootAngle), dy = Math.sin(shootAngle);
        let minT = 350, hitWall = null;
        if (dx > 0) { const t = (TBL_R - BALL_R - dragState.cx) / dx; if (t > 0 && t < minT) { minT = t; hitWall = 'v'; } }
        if (dx < 0) { const t = (TBL_L + BALL_R - dragState.cx) / dx; if (t > 0 && t < minT) { minT = t; hitWall = 'v'; } }
        if (dy > 0) { const t = (TBL_B - BALL_R - dragState.cy) / dy; if (t > 0 && t < minT) { minT = t; hitWall = 'h'; } }
        if (dy < 0) { const t = (TBL_T + BALL_R - dragState.cy) / dy; if (t > 0 && t < minT) { minT = t; hitWall = 'h'; } }

        const hitX = dragState.cx + dx * minT, hitY = dragState.cy + dy * minT;

        // Dotted aiming line
        aimGraphics.lineStyle(1.8, 0xffffff, 0.7);
        const dotLen = 6, gapLen = 4;
        const totalLen = minT;
        let drawn = 0;
        aimGraphics.beginPath();
        while (drawn < totalLen) {
            const startD = drawn, endD = Math.min(drawn + dotLen, totalLen);
            aimGraphics.moveTo(dragState.cx + dx * startD, dragState.cy + dy * startD);
            aimGraphics.lineTo(dragState.cx + dx * endD, dragState.cy + dy * endD);
            drawn = endD + gapLen;
        }
        aimGraphics.strokePath();

        // Ghost ball indicator at hit point
        aimGraphics.lineStyle(1, 0xffffff, 0.35);
        aimGraphics.strokeCircle(hitX, hitY, BALL_R);

        // Reflection line
        if (hitWall && minT < 350) {
            let rdx = dx, rdy = dy;
            if (hitWall === 'v') rdx = -dx;
            if (hitWall === 'h') rdy = -dy;
            aimGraphics.lineStyle(1, 0xffffff, 0.2);
            aimGraphics.beginPath(); aimGraphics.moveTo(hitX, hitY); aimGraphics.lineTo(hitX + rdx * 100, hitY + rdy * 100); aimGraphics.strokePath();
        }

        // Cue Stick
        scene.cueSprite.setVisible(true);
        const pullback = 5 + (dragDist * 0.5);
        scene.cueSprite.x = dragState.cx + Math.cos(dragAngle) * pullback;
        scene.cueSprite.y = dragState.cy + Math.sin(dragAngle) * pullback;
        scene.cueSprite.rotation = dragAngle - Math.PI / 2;

        // Power bar
        const power = dragDist / MAX_DRAG;
        scene.powerBarBg.setVisible(true); scene.powerBarFill.setVisible(true);
        scene.powerBarFill.setSize(10, power * 200);
        const r = Math.floor(34 + (239 - 34) * power);
        const g2 = Math.floor(197 + (68 - 197) * power);
        const b = Math.floor(94 + (68 - 94) * power);
        scene.powerBarFill.setFillStyle(Phaser.Display.Color.GetColor(r, g2, b));
    });

    scene.input.on('pointerup', (ptr) => {
        if (!dragState) return;
        aimGraphics.clear();
        scene.powerBarBg.setVisible(false); scene.powerBarFill.setVisible(false);
        scene.cueSprite.setVisible(false);

        const dist = Phaser.Math.Distance.Between(dragState.sx, dragState.sy, ptr.worldX, ptr.worldY);
        if (dist > 8) {
            const dragDist = Math.min(dist, MAX_DRAG);
            const angle = Phaser.Math.Angle.Between(dragState.sx, dragState.sy, ptr.worldX, ptr.worldY);
            socket.emit('shoot', { angle: angle + Math.PI, force: dragDist / MAX_DRAG });
        }
        dragState = null;
    });
}

function gameUpdate() {
    if (!serverState || !serverState.balls) return;
    const balls = serverState.balls;
    for (let i = 0; i < Math.min(balls.length, 16); i++) {
        if (balls[i].p) {
            ballSprites[i].setVisible(false); shadowSprites[i].setVisible(false);
        } else {
            ballSprites[i].setVisible(true); shadowSprites[i].setVisible(true);
            ballSprites[i].x = balls[i].x; ballSprites[i].y = balls[i].y; ballSprites[i].rotation = balls[i].a;
            shadowSprites[i].x = balls[i].x + 2.5; shadowSprites[i].y = balls[i].y + 3.5;
        }
    }
    updateScoreboard();
}

function updateScoreboard() {
    if (!serverState) return;
    const t = serverState.turn;
    const p1 = document.getElementById('p1-info'), p2 = document.getElementById('p2-info');
    const arrow = document.getElementById('turn-indicator');
    p1.classList.toggle('active-turn', t === 0);
    p2.classList.toggle('active-turn', t === 1);
    arrow.classList.toggle('left', t === 0);
    arrow.classList.toggle('right', t === 1);

    const pocketed = new Set(serverState.pocketed || []);
    updateDots('p1-dots', serverState.assignments[0], pocketed);
    updateDots('p2-dots', serverState.assignments[1], pocketed);
}

function updateDots(id, assignment, pocketed) {
    const c = document.getElementById(id);
    if (!c) return;
    c.innerHTML = '';
    if (!assignment) { c.innerHTML = '<span style="font-size:0.7rem;color:#9CA3AF">--</span>'; return; }
    const range = assignment === 'solids' ? [1,2,3,4,5,6,7] : [9,10,11,12,13,14,15];
    range.forEach(n => {
        const bi = serverState.balls.findIndex(b => b.n === n);
        const p = bi >= 0 && serverState.balls[bi].p;
        const dot = document.createElement('span');
        dot.className = 'ball-dot' + (p ? ' pocketed' : '');
        dot.style.background = BALL_CSS[n];
        c.appendChild(dot);
    });
}
