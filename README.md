# you-are-rhyme

> A voice-driven physics game where the emotional weight, pace, and semantics of your spoken words literally shape the world.

**you are rhyme** is an experimental interactive experience that chains local AI into a 2D physics engine. By translating vocal performance (via Whisper) and sentiment analysis (via Ollama) into a custom Domain Specific Language (DSL), the game turns your real-world emotions into real-time game mechanics—all within levels procedurally generated and validated by genetic algorithms.

## Architecture Overview

The project is split into three main pillars:

### 1. The Client (`/client`)
A modern frontend built with **React**, **Vite**, and **Matter.js**. 
* **Audio Capture:** Records raw audio bytes during a player's "turn" and tracks metadata (like WPM).
* **Game Engine:** Renders the procedurally generated levels and executes the physics commands returned by the server.

### 2. The AI Translation Pipeline (`/server` & `/python`)
The backend orchestrator (Node.js/Express) receives audio and passes it through an AI pipeline:
* **Transcription & Pacing:** A Python microservice using `faster-whisper` transcribes the audio and calculates the "dramatic pause duration" between spoken words.
* **Semantic Evaluation:** The text is sent to a local **Ollama** instance (running `llama3`), which scores the text from 0.0 to 1.0 across 5 themes: *Semantic (Role-swapping)*, *Volatility (Anger)*, *Desire*, *Disgust*, and *Burden*.
* **The DSL Compiler:** Uses a "Dominant Force" pattern. It evaluates the physical pacing and LLM semantic scores, finds the metric with the highest threshold margin, and translates it into a physical Matter.js command (e.g., Anger shatters glass, Pauses freeze the dagger, Heaviness increases mass).

### 3. Procedural Level Generation & Genetic Algorithms
Levels are not hand-crafted. They are generated and rigorously tested offline:
* **Level Generator:** Creates a JSON "genotype" (coordinates, gravity, dynamic debris, magnetic lodestones).
* **Bot Tester:** A headless Matter.js worker thread that simulates the level against all 8 game mechanics. It uses a "Goldilocks" fitness function to ensure the level isn't trivial, but also isn't too open—rewarding levels that can be beaten in exactly 2-4 distinct ways.
* **SQLite:** Validated levels are saved to `telemetry.sqlite` to be served to the frontend.

## Getting Started

### Prerequisites
* [Node.js](https://nodejs.org/) (v18+)
* [Python 3.8+](https://www.python.org/)
* [Ollama](https://ollama.com/) (with the `llama3` model pulled: `ollama run llama3`)

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/YourUsername/you-are-rhyme.git
   cd you-are-rhyme
   ```

2. **Start the Python Transcriber:**
   ```bash
   cd python
   python -m venv .venv
   # Activate venv (Windows: .venv\Scripts\activate | Mac/Linux: source .venv/bin/activate)
   pip install -r requirements.txt
   python transcriber.py
   ```

3. **Start the Node Backend:**
   ```bash
   cd server
   npm install
   npm start
   ```
   *(Note: To generate new levels, you can run `node ga-runner.js`)*

4. **Start the React Frontend:**
   ```bash
   cd client
   npm install
   npm run dev
   ```

## Telemetry & Logging
All player turns—including raw transcriptions, LLM scores, and the resulting DSL commands—are logged to `telemetry.sqlite` to help fine-tune the Dominant Force compiler thresholds and analyze player behavior.
