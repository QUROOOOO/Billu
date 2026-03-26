# Billu

Billu is a mobile-first, real-time multiplayer 2D 8-ball billiards game. Built with an authoritative server architecture for flawless physics synchronization and a modern, playful UI.

## Features
* **Real-Time Multiplayer:** Instant synchronization using WebSockets.
* **Mobile-First Design:** Fully optimized for portrait mode, touch controls, and high-resolution mobile screens.
* **Authoritative Physics:** Matter.js runs securely on the server to prevent cheating and desync.
* **AI Opponent:** Play against a machine with 3 distinct difficulty levels (Easy, Medium, Hard).
* **Room Codes & Groups:** Generate private lobby codes or create persistent friend groups.

## Tech Stack
* **Frontend:** HTML5, CSS3, JavaScript, Phaser.js
* **Backend:** Node.js, Express.js
* **Networking:** Socket.io
* **Physics Engine:** Matter.js

## Installation & Local Setup

1. **Clone the repository:**
   ```bash
   git clone https://github.com/QUROOOOO/Billu.git
   cd Billu
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Run the server:**
   ```bash
   node server.js
   ```

4. **Play:**
   Open your browser and navigate to `http://localhost:3000`.

## Deployment
This game is configured to be easily deployed on **Render** or **Railway**. Simply connect your GitHub repository, set the build command to `npm install`, and the start command to `node server.js`.
