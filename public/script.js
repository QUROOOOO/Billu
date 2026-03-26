/* ═══════════════════════════════════════════════════════════
   BILLU – Client Script (Fully Rebuilt UI, Bright & Playful)
   ═══════════════════════════════════════════════════════════ */
const socket = io();

// ─── State ───────────────────────────────────────────────────
let currentUser = null;
let currentToken = null;
let phaserGame = null;
let globalMute = false;

// ─── Phaser Constants & Config ───────────────────────────────
const GAME_W = 420, GAME_H = 780;
const TBL_L = 40, TBL_R = 380, TBL_T = 100, TBL_B = 720;
const CX = 210;
const BALL_R = 9;
const POCKET_R = 19;
const MAX_DRAG = 160;

// Helper: Bind Event safely
function bindEv(id, type, cb) {
    const el = document.getElementById(id);
    if (el) el.addEventListener(type, cb);
}

// Helper: Show Screen strictly
function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const el = document.getElementById(id);
    if (el) el.classList.add('active');
}

// ─── DOM Initialization & Routing ────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    // 1. Force Auth Screen initially, hide canvas
    showScreen('auth-screen');

    // 2. Auth Flow
    const tabs = document.querySelectorAll('.tab-btn');
    tabs.forEach(btn => {
        btn.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            btn.classList.add('active');
            document.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active'));
            const form = document.getElementById(btn.dataset.tab + '-form');
            if (form) form.classList.add('active');
        });
    });

    bindEv('login-form', 'submit', async (e) => {
        e.preventDefault();
        const u = document.getElementById('login-user').value.trim();
        const p = document.getElementById('login-pass').value;
        const res = await fetch('/api/login', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: u, password: p })
        }).then(r => r.json());
        
        if (res.success) enterLobby(res.username, res.token);
        else {
            const err = document.getElementById('auth-error-login');
            if (err) err.textContent = res.error;
        }
    });

    bindEv('signup-form', 'submit', async (e) => {
        e.preventDefault();
        const u = document.getElementById('signup-user').value.trim();
        const p = document.getElementById('signup-pass').value;
        const res = await fetch('/api/signup', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: u, password: p })
        }).then(r => r.json());
        
        if (res.success) enterLobby(res.username, res.token);
        else {
            const err = document.getElementById('auth-error-signup');
            if (err) err.textContent = res.error;
        }
    });

    // 3. Lobby UI
    bindEv('host-btn', 'click', () => socket.emit('hostRoom'));
    
    bindEv('join-btn', 'click', () => {
        const modal = document.getElementById('join-modal');
        if (modal) {
            modal.classList.remove('hidden');
            document.getElementById('join-code-input').value = '';
            document.getElementById('join-error').textContent = '';
        }
    });
    bindEv('join-cancel', 'click', () => {
        const m = document.getElementById('join-modal');
        if (m) m.classList.add('hidden');
    });
    bindEv('join-submit', 'click', () => {
        const c = document.getElementById('join-code-input').value.trim().toUpperCase();
        if (c.length >= 4) socket.emit('joinRoom', { code: c });
    });

    bindEv('ai-btn', 'click', () => {
        const m = document.getElementById('ai-menu');
        if (m) m.classList.remove('hidden');
    });
    bindEv('ai-cancel', 'click', () => {
        const m = document.getElementById('ai-menu');
        if (m) m.classList.add('hidden');
    });
    document.querySelectorAll('.diff-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const m = document.getElementById('ai-menu');
            if (m) m.classList.add('hidden');
            socket.emit('startAI', { difficulty: btn.dataset.diff });
        });
    });

    // Groups
    bindEv('groups-btn', 'click', () => {
        socket.emit('getGroups');
        showScreen('group-screen');
    });
    bindEv('groups-back', 'click', () => showScreen('lobby-screen'));
    bindEv('create-group-btn', 'click', () => {
        const i = document.getElementById('new-group-name');
        if (i && i.value.trim()) { socket.emit('createGroup', { name: i.value.trim() }); i.value = ''; }
    });
    bindEv('join-group-btn', 'click', () => {
        const i = document.getElementById('join-group-id');
        if (i && i.value.trim()) { socket.emit('joinGroup', { id: i.value.trim() }); i.value = ''; }
    });

    // 4. Game Controls UI
    bindEv('exit-game-btn', 'click', () => { window.location.reload(); });
    bindEv('exit-room-btn', 'click', () => { window.location.reload(); });
    bindEv('gameover-lobby', 'click', () => { window.location.reload(); });

    bindEv('fullscreen-btn', 'click', () => {
        if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {});
        else document.exitFullscreen();
    });

    bindEv('mute-game-btn', 'click', (e) => {
        globalMute = !globalMute;
        const btn = e.currentTarget;
        if (globalMute) {
            btn.classList.add('active-mute');
            btn.innerHTML = '<svg viewBox="0 0 24 24" stroke="currentColor" fill="none" stroke-width="2.5" stroke-linecap="round"><path d="M11 5L6 9H2v6h4l5 4V5z"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>';
            if (phaserGame && phaserGame.sound) phaserGame.sound.mute = true;
        } else {
            btn.classList.remove('active-mute');
            btn.innerHTML = '<svg viewBox="0 0 24 24" stroke="currentColor" fill="none" stroke-width="2.5" stroke-linecap="round"><path d="M11 5L6 9H2v6h4l5 4V5z"/><path d="M19 12h.01 M16 9h.01 M16 15h.01 M22 9h.01 M22 15h.01"/></svg>';
            if (phaserGame && phaserGame.sound) phaserGame.sound.mute = false;
        }
    });

    // Ping
    setInterval(() => {
        const t = Date.now();
        socket.emit('pingEvent', () => {
            const p = document.getElementById('ping-val');
            if (p) p.textContent = Date.now() - t;
        });
    }, 2000);
});

// ─── Socket Connections ──────────────────────────────────────
function enterLobby(username, token) {
    currentUser = username;
    currentToken = token;
    const dp = document.getElementById('username-display');
    if (dp) dp.textContent = username;
    socket.emit('identify', { username, token });
    showScreen('lobby-screen');
}

socket.on('roomCreated', (data) => {
    const rc = document.getElementById('room-code-display');
    if (rc) rc.textContent = data.code;
    showScreen('room-screen');
});

socket.on('joinError', (msg) => {
    const je = document.getElementById('join-error');
    if (je) je.textContent = msg;
});

socket.on('gameStarted', (data) => {
    const m = document.getElementById('join-modal');
    if (m) m.classList.add('hidden');
    startGame(data.players);
});

socket.on('gameOver', (data) => {
    const overlay = document.getElementById('gameover-overlay');
    if (!overlay) return;
    const t = document.getElementById('gameover-title');
    const r = document.getElementById('gameover-reason');
    if (t) t.textContent = data.winner === currentUser ? 'You Win!' : 'You Lose';
    if (r) r.textContent = data.reason;
    overlay.classList.remove('hidden');
});

// Groups Sync
socket.on('groupCreated', () => socket.emit('getGroups'));
socket.on('groupJoined', () => socket.emit('getGroups'));
socket.on('groupsList', (list) => {
    const c = document.getElementById('group-list');
    if (!c) return;
    c.innerHTML = '';
    list.forEach(g => {
        const card = document.createElement('div');
        card.className = 'group-card';
        let membersHTML = g.members.map(m =>
            `<div class="member-row"><span class="status-dot ${m.online ? 'online' : 'offline'}"></span><span>${m.name}</span></div>`
        ).join('');
        card.innerHTML = `<h4>${g.name} <small>ID: ${g.id}</small></h4>${membersHTML}<button class="btn-block btn-blue play-now-btn" data-gid="${g.id}">Play Now</button>`;
        c.appendChild(card);
    });
    c.querySelectorAll('.play-now-btn').forEach(btn => {
        btn.addEventListener('click', () => socket.emit('groupInvite', { groupId: btn.dataset.gid }));
    });
});
socket.on('presenceUpdate', () => {
    const gs = document.getElementById('group-screen');
    if (gs && gs.classList.contains('active')) socket.emit('getGroups');
});

// Match Invites
socket.on('matchInvite', (data) => {
    const toast = document.getElementById('invite-toast');
    if (!toast) return;
    const msg = document.getElementById('invite-msg');
    if (msg) msg.textContent = `${data.from} invited you from ${data.groupName}!`;
    toast.classList.remove('hidden');
    document.getElementById('invite-accept').onclick = () => { socket.emit('joinRoom', { code: data.code }); toast.classList.add('hidden'); };
    document.getElementById('invite-decline').onclick = () => { toast.classList.add('hidden'); };
});

// ─── Phaser Integration ──────────────────────────────────────
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

    const p1n = document.getElementById('p1-name');
    const p2n = document.getElementById('p2-name');
    if (p1n) p1n.textContent = players[0] || 'P1';
    if (p2n) p2n.textContent = players[1] || 'P2';

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
        contextCreation: { willReadFrequently: true },
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
    this.load.svg('table_tex', 'assets/table.svg', { width: GAME_W, height: GAME_H });
    for (let i = 0; i <= 15; i++) {
        this.load.svg(`ball_${i}`, `assets/ball_${i}.svg`, { width: BALL_R*4, height: BALL_R*4 });
    }
    this.load.svg('cue_stick', 'assets/cue_stick.svg', { width: 10, height: 260 }); // Roughly long thin
    this.load.audio('hit', 'https://labs.phaser.io/assets/audio/SoundEffects/squit.wav');
}

function gameCreate() {
    // 1. Render Table Base SVG
    this.add.image(GAME_W/2, GAME_H/2, 'table_tex');

    // 2. Shadows & Balls
    ballSprites = [];
    shadowSprites = [];
    for (let i = 0; i <= 15; i++) {
        let shadow = this.add.circle(0, 0, BALL_R, 0x000000, 0.4);
        let sprite = this.add.sprite(0, 0, `ball_${i}`);
        sprite.setDisplaySize(BALL_R*2, BALL_R*2);
        shadow.setVisible(false);
        sprite.setVisible(false);
        shadowSprites.push(shadow);
        ballSprites.push(sprite);
    }

    // 3. Cue Stick & Aim Line
    aimGraphics = this.add.graphics();
    let cueSprite = this.add.sprite(0, 0, 'cue_stick');
    cueSprite.setOrigin(0.5, 0); // Origin at tip
    cueSprite.setVisible(false);
    this.cueSprite = cueSprite; 

    // Sound Setup
    this.sound.mute = globalMute;
    socket.on('ballHit', () => {
        this.sound.play('hit', { volume: 0.3 });
    });

    // 4. Input Events
    this.input.on('pointerdown', (pointer) => {
        if (myPlayerIndex === -1) return;
        if (!serverState || serverState.turn !== myPlayerIndex) return;
        if (serverState.isMoving) return;
        
        let cb = serverState.balls[0];
        if (!cb.pocketed) {
            dragState = { startX: pointer.x, startY: pointer.y, currentX: pointer.x, currentY: pointer.y };
        }
    });

    this.input.on('pointermove', (pointer) => {
        if (!dragState) return;
        dragState.currentX = pointer.x;
        dragState.currentY = pointer.y;
    });

    this.input.on('pointerup', () => {
        if (!dragState) return;
        let dx = dragState.startX - dragState.currentX;
        let dy = dragState.startY - dragState.currentY;
        let force = Math.sqrt(dx*dx + dy*dy);
        if (force > 5) {
            let clampedForce = Math.min(force, MAX_DRAG);
            // Multiply power by 100x to ensure tangible Matter.js force
            socket.emit('shoot', { vec: { x: dx, y: dy }, power: (clampedForce / MAX_DRAG) * 100 });
        }
        dragState = null;
        aimGraphics.clear();
        this.cueSprite.setVisible(false);
    });
}

function gameUpdate() {
    if (!serverState) return;
    let s = serverState;

    // Turn UI
    const ti = document.getElementById('turn-indicator');
    if (ti) {
        if (s.turn === 0) ti.className = 'turn-arrow turn-indicator-left';
        else ti.className = 'turn-arrow turn-indicator-right';
    }

    // P1 & P2 pocketed sync
    const p1Container = document.getElementById('p1-dots');
    const p2Container = document.getElementById('p2-dots');
    if (p1Container && p2Container) {
        p1Container.innerHTML = ''; p2Container.innerHTML = '';
        s.balls.forEach((b, i) => {
            if (i > 0 && i < 8) {
                let div = document.createElement('div');
                div.className = b.pocketed ? 'ball-dot pocketed' : 'ball-dot';
                div.style.background = '#EF4444'; // Red for Solids
                (s.players[0].assigned === 'solids' ? p1Container : p2Container).appendChild(div);
            }
            if (i > 8) {
                let div = document.createElement('div');
                div.className = b.pocketed ? 'ball-dot pocketed' : 'ball-dot';
                div.style.background = '#3B82F6'; // Blue for Stripes
                (s.players[0].assigned === 'stripes' ? p1Container : p2Container).appendChild(div);
            }
        });
    }

    // Positions mapping
    for (let i = 0; i <= 15; i++) {
        let b = s.balls[i];
        let spr = ballSprites[i];
        let shd = shadowSprites[i];
        if (b.pocketed) {
            spr.setVisible(false); shd.setVisible(false);
        } else {
            spr.setVisible(true); shd.setVisible(true);
            spr.setPosition(b.x, b.y);
            spr.rotation += (b.vx || 0) * 0.1; 
            shd.setPosition(b.x + 3, b.y + 3);
        }
    }

    // Aim Line & Cue Rotation
    aimGraphics.clear();
    this.cueSprite.setVisible(false);
    
    if (dragState) {
        let cb = s.balls[0];
        let dx = dragState.startX - dragState.currentX;
        let dy = dragState.startY - dragState.currentY;
        let dist = Math.min(Math.sqrt(dx*dx + dy*dy), MAX_DRAG);
        if (dist > 5) {
            let angle = Math.atan2(dy, dx);
            aimGraphics.lineStyle(2, 0xFFFFFF, 0.4);
            aimGraphics.beginPath();
            aimGraphics.moveTo(cb.x, cb.y);
            aimGraphics.lineTo(cb.x + Math.cos(angle)*dist*2, cb.y + Math.sin(angle)*dist*2);
            aimGraphics.strokePath();

            this.cueSprite.setVisible(true);
            let offsetDist = BALL_R + 5 + dist;
            this.cueSprite.setPosition(cb.x - Math.cos(angle)*offsetDist, cb.y - Math.sin(angle)*offsetDist);
            this.cueSprite.rotation = angle - Math.PI/2; 
        }
    }
}
