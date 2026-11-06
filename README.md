# you-are-rhyme

> A voice-activated theatrical dueling engine where the emotional weight, pace, and semantics of your spoken words dictate a multi-turn tactical grid battle.

**you are rhyme** is an experimental interactive experience that chains local AI into a 2D grid-based tactical engine. By translating vocal performance (via Whisper) and script accuracy (via Levenshtein distance) into a custom Domain Specific Language (DSL), the game turns your real-world delivery of Hamlet (Act 3, Scene 4) into real-time game mechanics—all within levels procedurally generated and validated by genetic algorithms.

## Architecture Overview

The project is split into three main pillars:

### 1. The Client (`/client`)
A modern frontend built with **React** and **Vite**. 
* **Audio Capture:** Records raw audio bytes during a player's "turn" and streams them to the server.
* **Game Engine:** Renders the procedurally generated 20x15 grid stage and animates the discrete grid commands (e.g., Lunge +3) returned by the server.

### 2. The AI Translation Pipeline (`/server` & `/python`)
The backend orchestrator (Node.js/Express) receives audio and passes it through an AI pipeline:
* **Transcription & Pacing:** A Python microservice using Whisper transcribes the audio and calculates the "dramatic pause duration" and words-per-minute pacing.
* **Semantic Evaluation:** The backend calculates the Levenshtein distance between the raw transcription and the expected script line to measure script deviation.
* **The DSL Compiler:** Resolves the player's acoustic performance into 8 character-specific tactical commands (Lunge, Feint, Pierce, Fracture for Hamlet; Repel, Interpose, Solidify, Disarm for Gertrude).

### 3. Procedural Level Generation & Genetic Algorithms
Levels are not hand-crafted. They are generated and rigorously tested offline:
* **Level Generator:** Creates a JSON "genotype" mapping the grid coordinates for all stage elements (Arras boundaries, Furniture obstacles, and character starting positions).
* **Bot Tester:** Evaluates fitness by simulating a 9-turn match between a Greedy Hamlet AI and a Greedy Gertrude AI. It ensures levels possess structural tension by seeking a defensive success rate of 20-30%—preventing unwinnable choke points.
* **SQLite:** Validated levels are saved to `telemetry.sqlite` to be served to the frontend.

## Getting Started

### Prerequisites
* [Node.js](https://nodejs.org/) (v18+)
* [Python 3.8+](https://www.python.org/)

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/YourUsername/you-are-rhyme.git
   cd you-are-rhyme
   ```

2. **Setup the Python Environment:**
   Because the startup script points to a local virtual environment, you must initialize it first:
   ```bash
   cd python
   python -m venv .venv
   # Activate venv (Windows: .venv\Scripts\activate | Mac/Linux: source .venv/bin/activate)
   pip install -r requirements.txt
   cd ..
   ```

3. **Install Dependencies:**
   A root helper script will automatically install the root, server, and client dependencies.
   ```bash
   npm run install:all
   ```

4. **Spin Everything Up:**
   Start the React frontend, Node backend, and Python transcriber all at once using `concurrently`.
   ```bash
   npm start
   ```
   
5. **Play the Game:**
   Open your web browser and navigate to [http://localhost:5173](http://localhost:5173) to enter the stage!

   *(Note: To procedurally generate new levels offline, run `cd server && node ga-runner.js`)*

## Telemetry & Logging
All player turns—including raw transcriptions, acoustic metrics, and the resulting DSL commands—are logged to `telemetry.sqlite` to help fine-tune the DSL compiler thresholds.

---

## 2-Player Synchronous Multiplayer (Hamlet vs. Gertrude)

*You Are Rhyme* features a server-synchronized 1v1 multiplayer mode where one human actor portrays **Prince Hamlet** and another portrays **Queen Gertrude**.

### Hosting with Windows

You can host the multiplayer chamber on any Windows machine:

1. **Option A: Dedicated Host Launcher (Inside Clone)**
   If you already cloned the repository:
   ```cmd
   npm run host:win
   :: or simply double-click:
   scripts\host-windows.bat
   ```

2. **Option B: Turnkey Windows Setup (Automatic Dependencies)**
   For a clean or fresh Windows computer, run:
   ```cmd
   scripts\setup-and-host-windows.bat
   ```
   This will verify Git, Node.js, and Python, install dependencies, download `cloudflared.exe` automatically if needed, and start the host with a public HTTPS tunnel.

3. **Share the Link:**
   The terminal will output local LAN addresses and a public HTTPS link (e.g. `https://xxxx.trycloudflare.com`).
   * **Player 1 (Hamlet)** creates a chamber (e.g., `BARD`) and clicks **"Copy Invitation Link"**.
   * **Player 2 (Gertrude)** opens the link and claims Queen Gertrude.
   * Both actors enter the Queen's Closet stage and duel turn-by-turn.

### Hosting with the Mac Build Machine

You can host the multiplayer duel on your Mac build machine. To enable remote microphone recording over HTTPS without campus firewall hurdles, the host uses **Cloudflare Quick Tunnels** (`cloudflared`):

1. **Install cloudflared (optional, for instant public HTTPS):**
   ```bash
   brew install cloudflared
   ```

2. **Launch the Mac Multiplayer Host:**
   ```bash
   npm run host:mac
   # or: bash scripts/host-mac.sh
   # or for turnkey setup on clean Mac:
   # bash scripts/setup-and-host-mac.sh
   ```

3. **Share the Link:**
   The terminal will output a public HTTPS link (e.g. `https://xxxx.trycloudflare.com`).
   * **Player 1 (Hamlet)** creates a chamber (e.g., `BARD`) and clicks **"Copy Invitation Link"**.
   * **Player 2 (Gertrude)** opens the direct link (`https://xxxx.trycloudflare.com/?room=BARD`) and claims Queen Gertrude.
   * Both actors enter the Queen's Closet stage and duel turn-by-turn.
