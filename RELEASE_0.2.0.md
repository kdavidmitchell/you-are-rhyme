# You Are Rhyme v0.2.0: Synchronous 2-Player Multiplayer & Turnkey Hosting

`You Are Rhyme` v0.2.0 introduces real-time two-player multiplayer, turnkey public HTTPS hosting via Cloudflare Tunnels, pre-seeded procedural levels, and frontend aesthetic updates.

---

## What's New

### 1. Synchronous 2-Player Multiplayer
- **Head-to-Head Play**: Play as Prince Hamlet or Queen Gertrude.
- **Room Code Lobby**: Create or join matches using simple 4-letter room codes (e.g., `BARD`).
- **Real-Time Synchronization**: Live turn handoffs, vocal meter feeds, player movement, cooldowns, and grid state synchronize over WebSockets.

### 2. Turnkey HTTPS Hosting (Zero-Install for Player 2)
- **One-Command Setup**: Automated scripts handle installation and hosting on macOS (`scripts/setup-and-host-mac.sh`) and Windows (`scripts\setup-and-host-windows.bat`).
- **Cloudflare Quick Tunnels**: Generates a secure, temporary HTTPS link with no account or port forwarding needed.
- **Browser-Only Remote Play**: Your opponent can join from any modern web browser on Mac, Windows, Linux, or mobile with microphone access.

### 3. Pre-Seeded MAP-Elites Level Archive
- Ships with 9 pre-evolved procedural levels balancing combat tension, obstacle density, and room layout variety.
- Automatic offline fallback generation if external services are unavailable.

### 4. Frontend and Aesthetic Updates
- Auto-scaling 20×15 grid container with a 1320px responsive breakpoint for laptops and external displays.
- Cleaner turn banners, live audio meters, and match status indicators.

### 5. Streamlined Documentation
- Simplified setup guides in `README.md` for fast onboarding.
