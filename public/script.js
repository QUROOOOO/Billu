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

function gamePreload() {}

/* ─── High-Res Ball Texture Generator ──────────────────────── */
function generateBallTexture(scene, ballNum, texSize) {
    const g = scene.make.graphics({ add: false });
    const cx = texSize / 2, cy = texSize / 2, r = texSize / 2 - 2;
    const color = hexToInt(BALL_COLORS_HEX[ballNum]);

    if (ballNum === 0) {
        // Cue ball: white with specular highlight
        g.fillStyle(0xF0F0F0); g.fillCircle(cx, cy, r);
        // Subtle rim shadow
        g.fillStyle(0xCCCCCC, 0.35); g.fillCircle(cx + 1, cy + 2, r * 0.92);
        g.fillStyle(0xF0F0F0); g.fillCircle(cx, cy, r * 0.88);
        // Specular highlight
        g.fillStyle(0xFFFFFF, 0.9); g.fillCircle(cx - r * 0.28, cy - r * 0.3, r * 0.32);
        g.fillStyle(0xFFFFFF, 0.5); g.fillCircle(cx - r * 0.15, cy - r * 0.15, r * 0.15);
    } else if (ballNum >= 9) {
        // Stripe ball: white body with color band
        g.fillStyle(0xF5F5F5); g.fillCircle(cx, cy, r);
        // Color band in the center
        const bandH = r * 0.85;
        g.fillStyle(color);
        g.fillRect(cx - r, cy - bandH / 2, r * 2, bandH);
        // Clip to circle shape: overdraw white outside circle
        // Left/right edges
        for (let y = -r; y <= r; y++) {
            const w = Math.sqrt(r * r - y * y);
            g.fillStyle(0xF5F5F5);
            g.fillRect(cx - r - 2, cy + y, r - w + 2, 1);
            g.fillRect(cx + w, cy + y, r - w + 2, 1);
        }
        // Top and bottom white caps (poles)
        g.fillStyle(0xF5F5F5);
        g.fillCircle(cx, cy - r * 0.55, r * 0.5);
        g.fillCircle(cx, cy + r * 0.55, r * 0.5);
        // Number circle
        g.fillStyle(0xFFFFFF); g.fillCircle(cx, cy, r * 0.28);
        g.fillStyle(color, 0.05); g.fillCircle(cx, cy, r * 0.28);
        // Specular
        g.fillStyle(0xFFFFFF, 0.55); g.fillCircle(cx - r * 0.25, cy - r * 0.3, r * 0.22);
        // Rim shadow
        g.fillStyle(0x000000, 0.08); g.fillCircle(cx + 1, cy + 2, r);
        g.fillStyle(ballNum >= 9 ? 0xF5F5F5 : color, 0); // transparent overdraw for edge
    } else {
        // Solid ball: full color
        g.fillStyle(color); g.fillCircle(cx, cy, r);
        // Gradient shading
        g.fillStyle(0x000000, 0.12); g.fillCircle(cx + 2, cy + 3, r * 0.9);
        g.fillStyle(color); g.fillCircle(cx, cy, r * 0.88);
        // Number circle
        g.fillStyle(0xFFFFFF); g.fillCircle(cx, cy, r * 0.28);
        // Specular highlight
        g.fillStyle(0xFFFFFF, 0.6); g.fillCircle(cx - r * 0.25, cy - r * 0.3, r * 0.24);
        g.fillStyle(0xFFFFFF, 0.3); g.fillCircle(cx - r * 0.12, cy - r * 0.12, r * 0.12);
    }

    g.generateTexture('ball_' + ballNum, texSize, texSize);
    g.destroy();
}

function hexToInt(hex) {
    return parseInt(hex.replace('#', ''), 16);
}

function gameCreate() {
    const scene = this;
    // Higher-resolution textures (2x for crispness on retina)
    const TEX_SIZE = Math.ceil((BALL_R + 1) * 2 * (window.devicePixelRatio || 1));
    const DISPLAY_SIZE = (BALL_R + 1) * 2;

    // ─── Table ───────────────────────────────────────────────

    // Outer wood frame with grain texture
    const woodFrame = scene.add.graphics();
    const frameL = TBL_L - 26, frameR = TBL_R + 26, frameT = TBL_T - 26, frameB = TBL_B + 26;
    woodFrame.fillStyle(0x3E2723); woodFrame.fillRoundedRect(frameL, frameT, frameR - frameL, frameB - frameT, 8);
    // Inner wood bevel
    woodFrame.fillStyle(0x5D4037, 0.6); woodFrame.fillRoundedRect(frameL + 3, frameT + 3, frameR - frameL - 6, frameB - frameT - 6, 6);
    woodFrame.fillStyle(0x3E2723); woodFrame.fillRoundedRect(frameL + 8, frameT + 8, frameR - frameL - 16, frameB - frameT - 16, 4);

    // Green felt with subtle noise
    const felt = scene.add.graphics();
    felt.fillStyle(0x1A7A3D); felt.fillRect(TBL_L, TBL_T, TBL_R - TBL_L, TBL_B - TBL_T);
    // Felt edge darkening
    felt.fillStyle(0x0C5C2B, 0.25);
    felt.fillRect(TBL_L, TBL_T, TBL_R - TBL_L, 6);
    felt.fillRect(TBL_L, TBL_B - 6, TBL_R - TBL_L, 6);
    felt.fillRect(TBL_L, TBL_T, 6, TBL_B - TBL_T);
    felt.fillRect(TBL_R - 6, TBL_T, 6, TBL_B - TBL_T);

    // Cushion bumpers with beveled look
    const cushionG = scene.add.graphics();
    const cb = 0x14622C, cbH = 0x1E9645, cw = 14;

    // Top cushion
    cushionG.fillStyle(cbH); cushionG.fillRect(TBL_L + POCKET_R * 2, TBL_T - cw, (TBL_R - TBL_L) - POCKET_R * 4, cw / 2);
    cushionG.fillStyle(cb); cushionG.fillRect(TBL_L + POCKET_R * 2, TBL_T - cw / 2, (TBL_R - TBL_L) - POCKET_R * 4, cw / 2);
    // Bottom cushion
    cushionG.fillStyle(cb); cushionG.fillRect(TBL_L + POCKET_R * 2, TBL_B, (TBL_R - TBL_L) - POCKET_R * 4, cw / 2);
    cushionG.fillStyle(cbH); cushionG.fillRect(TBL_L + POCKET_R * 2, TBL_B + cw / 2, (TBL_R - TBL_L) - POCKET_R * 4, cw / 2);
    // Left cushions
    const lY1 = TBL_T + POCKET_R * 1.5, lY2 = (TBL_T + TBL_B) / 2 - POCKET_R * 0.8;
    const lY3 = (TBL_T + TBL_B) / 2 + POCKET_R * 0.8, lY4 = TBL_B - POCKET_R * 1.5;
    cushionG.fillStyle(cbH); cushionG.fillRect(TBL_L - cw, lY1, cw / 2, lY2 - lY1);
    cushionG.fillStyle(cb); cushionG.fillRect(TBL_L - cw / 2, lY1, cw / 2, lY2 - lY1);
    cushionG.fillStyle(cbH); cushionG.fillRect(TBL_L - cw, lY3, cw / 2, lY4 - lY3);
    cushionG.fillStyle(cb); cushionG.fillRect(TBL_L - cw / 2, lY3, cw / 2, lY4 - lY3);
    // Right cushions
    cushionG.fillStyle(cb); cushionG.fillRect(TBL_R, lY1, cw / 2, lY2 - lY1);
    cushionG.fillStyle(cbH); cushionG.fillRect(TBL_R + cw / 2, lY1, cw / 2, lY2 - lY1);
    cushionG.fillStyle(cb); cushionG.fillRect(TBL_R, lY3, cw / 2, lY4 - lY3);
    cushionG.fillStyle(cbH); cushionG.fillRect(TBL_R + cw / 2, lY3, cw / 2, lY4 - lY3);

    // Pocket holes (dark with slight gradient)
    const pocketG = scene.add.graphics();
    POCKET_POS.forEach(p => {
        pocketG.fillStyle(0x000000, 0.85); pocketG.fillCircle(p.x, p.y, POCKET_R + 2);
        pocketG.fillStyle(0x0a0a0a); pocketG.fillCircle(p.x, p.y, POCKET_R);
        pocketG.fillStyle(0x111111, 0.6); pocketG.fillCircle(p.x, p.y, POCKET_R - 3);
    });

    // Head string line
    scene.add.line(0, 0, TBL_L + 10, 550, TBL_R - 10, 550, 0xFFFFFF, 0.1).setOrigin(0);

    // Diamond sights (metallic)
    const ds = 4;
    const diamondG = scene.add.graphics();
    diamondG.fillStyle(0xDAAA5E);
    for (let i = 1; i <= 3; i++) {
        const xp = TBL_L + i * (TBL_R - TBL_L) / 4;
        diamondG.fillCircle(xp, TBL_T - 18, ds);
        diamondG.fillCircle(xp, TBL_B + 18, ds);
        // Metallic highlight
        diamondG.fillStyle(0xF5D590, 0.6); diamondG.fillCircle(xp - 1, TBL_T - 19, ds * 0.4);
        diamondG.fillCircle(xp - 1, TBL_B + 17, ds * 0.4);
        diamondG.fillStyle(0xDAAA5E);
    }
    for (let i = 1; i <= 5; i++) {
        const yp = TBL_T + i * (TBL_B - TBL_T) / 6;
        diamondG.fillCircle(TBL_L - 18, yp, ds);
        diamondG.fillCircle(TBL_R + 18, yp, ds);
        diamondG.fillStyle(0xF5D590, 0.6);
        diamondG.fillCircle(TBL_L - 19, yp - 1, ds * 0.4);
        diamondG.fillCircle(TBL_R + 17, yp - 1, ds * 0.4);
        diamondG.fillStyle(0xDAAA5E);
    }

    // ─── Generate Ball Textures ──────────────────────────────
    for (let i = 0; i <= 15; i++) generateBallTexture(scene, i, TEX_SIZE);

    // Shadow texture (soft gaussian-like)
    const sg = scene.make.graphics({ add: false });
    sg.fillStyle(0x000000, 0.15); sg.fillCircle(TEX_SIZE / 2 + 1, TEX_SIZE / 2 + 1, TEX_SIZE / 2 - 2);
    sg.fillStyle(0x000000, 0.25); sg.fillCircle(TEX_SIZE / 2, TEX_SIZE / 2, TEX_SIZE / 2 - 4);
    sg.generateTexture('shadow', TEX_SIZE, TEX_SIZE); sg.destroy();

    // ─── Create Sprites ──────────────────────────────────────
    ballSprites = []; shadowSprites = [];
    const scale = DISPLAY_SIZE / TEX_SIZE;
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

        // Pull-back indicator
        aimGraphics.lineStyle(3, 0xEF4444, 0.4);
        aimGraphics.beginPath();
        aimGraphics.moveTo(dragState.cx, dragState.cy);
        aimGraphics.lineTo(dragState.cx + Math.cos(dragAngle) * dragDist * 0.5, dragState.cy + Math.sin(dragAngle) * dragDist * 0.5);
        aimGraphics.strokePath();

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
