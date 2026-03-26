# Billu

Billu is a mobile-first, real-time multiplayer 2D 8-ball billiards game. Built with an authoritative server architecture for flawless physics synchronization and a modern, playful UI.

## Features
* **Real-Time Multiplayer:** Instant synchronization using WebSockets.
* **Mobile-First Design:** Fully optimized for portrait mode, touch controls, and high-resolution mobile screens.
* **Authoritative Physics:** Matter.js runs securely on the server to prevent cheating and desync.
* **AI Opponent:** Play against a machine with 3 distinct difficulty levels (Easy, Medium, Hard).
* **Room Codes & Groups:** Generate private lobby codes or create persistent friend groups.

## Latest Update: The SVG Revolution
We have completely overhauled the graphics engine from generating procedural pixel textures to a strictly vector-based (**SVG only**) rendering pipeline:
* **High-Definition Vectors:** All table graphics, 16 billiard balls, and cues are now fully scalable SVGs with soft faux-3D gradients, maintaining pristine sharpness on high-DPI (Retina) mobile screens. (`window.devicePixelRatio` enabled).
* **Improved Performance & Rendering:** SVGs natively scale with zero compression artifacts without heavy canvas redraw operations.
* **Unified UI Language:** The ingame dashboard overlay has been completely rebuilt to match our main menu's aesthetic constraints (Bright styling, `Nunito` rounded typography, shadow cards, and DOM-layered UI controls).

### How to Play (Best Experience)
Billu is heavily optimized for an authentic billiards experience on modern smartphones in **Portrait Mode**.
* Open your browser console or device emulator (e.g., iPhone 12 Pro) and snap it to portrait.
* Host a room, drag backward from the cue ball, and release to strike!

## Tech Stack
* **Frontend:** HTML5, CSS3, JavaScript, Phaser.js
* **Backend:** Node.js, Express.js
* **Networking:** Socket.io
* **Physics Engine:** Matter.js
