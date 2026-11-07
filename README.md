# You Are Rhyme

> A voice-controlled theatrical game where the volume, timing, and accuracy of your spoken Shakespearean verse dictate an asymmetric 2D tactical duel between Prince Hamlet and Queen Gertrude (Act 3, Scene 4).

---

## Requirements

Before you begin, make sure your computer has the following installed:

1. **[Git](https://git-scm.com/)** — to download and update the repository.
2. **[Node.js](https://nodejs.org/)** (v18 or higher) — runs the game server and web client.
3. **[Python](https://www.python.org/)** (v3.10 or higher) — runs the local speech recognition service.
4. **Working Microphone** — to capture your vocal delivery.

---

## Quick Start

### On macOS

1. Open **Terminal** and clone the repository:
   ```bash
   git clone https://github.com/kdavidmitchell/you-are-rhyme.git
   cd you-are-rhyme
   ```

2. Run the automated setup and host script:
   ```bash
   bash scripts/setup-and-host-mac.sh
   ```
   *This automatically sets up Python, installs all dependencies, configures an HTTPS tunnel for microphone access, and starts the game.*

3. Open the URL printed in your terminal:
   * **Local Play:** `http://localhost:5173`
   * **Online Multiplayer:** Open the printed `https://xxxx.trycloudflare.com` link.

---

### On Windows

1. Open **Command Prompt** or **PowerShell** and clone the repository:
   ```cmd
   git clone https://github.com/kdavidmitchell/you-are-rhyme.git
   cd you-are-rhyme
   ```

2. Run the automated setup and host script:
   ```cmd
   scripts\setup-and-host-windows.bat
   ```
   *(Or in PowerShell: `.\scripts\setup-and-host-windows.ps1`)*

3. Open the URL printed in your terminal:
   * **Local Play:** `http://localhost:5173`
   * **Online Multiplayer:** Open the printed `https://xxxx.trycloudflare.com` link.

---

## How to Play

1. **Choose Your Role**:
   * **Prince Hamlet (Attacker)**: Advance across the stage and drive your rapier through the arras tapestry to strike Polonius.
   * **Queen Gertrude (Defender)**: Protect Polonius by blocking firing lanes, placing furniture obstacles, and disarming Hamlet before the 18 dialogue lines expire.
2. **Solo Practice (CPU Partner)**:
   * Check **"Solo Practice (CPU Partner)"** in the lobby to rehearse against an automated tactical bot.
3. **2-Player Multiplayer**:
   * Player 1 clicks **"Create Chamber"** and shares the invitation link.
   * Player 2 opens the link in their browser and claims the remaining character.
   * Both actors take turns speaking their lines into their microphones.

---

## Spoken Formactions (Vocal Mechanics)

| Character | Formaction | How to Perform | In-Game Effect |
| :--- | :--- | :--- | :--- |
| **Hamlet** | **Lunge** | Louder speech (RMS volume) | Advances rapier 1–4 tiles forward. If preceded by a pause, pierces 1 furniture obstacle. |
| **Hamlet** | **Pierce** | Dramatic pause (> 1.5s) | Thrusts at least 3 tiles forward, passing through obstacles and piercing directly through the arras. |
| **Hamlet** | **Feint** | Faster or slower tempo (cadence) | Dodges vertically toward Polonius' corridor, maneuvers around obstacles, or recovers a dropped blade. |
| **Hamlet** | **Fracture** | Script deviation (improvisation) | Destroys the obstacle or arras tile directly ahead of the blade. |
| **Gertrude**| **Barricade** | Dramatic pause (> 1.5s) | Slides the nearest furniture obstacle directly into Hamlet's line of fire. |
| **Gertrude**| **Repel** | Louder speech (regal volume) | Knocks Hamlet's rapier back 1–2 tiles. |
| **Gertrude**| **Interpose**| Faster or slower tempo (cadence) | Gertrude steps directly into the corridor midpoint to physically shield Polonius. |
| **Gertrude**| **Disarm** | Script deviation (improvisation) | Deflects Hamlet's rapier vertically, forcing him to spend a turn feinting to retrieve it. |

---

## Manual Developer Setup (Optional)

If you prefer to start each service manually:

1. **Python Transcription Service:**
   ```bash
   cd python
   python -m venv .venv
   # Windows: .venv\Scripts\activate | macOS: source .venv/bin/activate
   pip install -r requirements.txt
   python transcriber.py
   ```
2. **Game Server:**
   ```bash
   npm install --prefix server
   npm start --prefix server
   ```
3. **Web Client:**
   ```bash
   npm install --prefix client
   npm run dev --prefix client
   ```
4. **Offline Level Evolution (Optional):**
   ```bash
   npm run ga --prefix server
   ```
   *(Evolves a 5x5 MAP-Elites archive of levels playtested by bot personas. 9 pre-evolved levels are already seeded automatically on startup!)*
