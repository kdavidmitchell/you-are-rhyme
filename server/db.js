const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const dbPath = path.resolve(__dirname, 'telemetry.sqlite');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database', err.message);
  } else {
    console.log('Connected to the SQLite database.');
    db.serialize(() => {
      db.run(`CREATE TABLE IF NOT EXISTS telemetry (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
          sessionId TEXT,
          event_type TEXT,
          data TEXT
      )`);

      db.run(`CREATE TABLE IF NOT EXISTS levels (
          id TEXT PRIMARY KEY,
          config TEXT,
          solution TEXT,
          par INTEGER,
          fitness REAL,
          claustrophobia REAL,
          tactical_friction REAL,
          map_cell TEXT,
          entropy_score REAL,
          tension_score REAL,
          counterplay_score REAL
      )`, (tableErr) => {
        if (tableErr) return;

        // Auto-seed if levels table is empty
        db.get("SELECT count(*) as count FROM levels", (countErr, row) => {
          if (!countErr && row && row.count === 0) {
            const seedPath = path.resolve(__dirname, 'seed-levels.json');
            if (fs.existsSync(seedPath)) {
              try {
                const seedData = JSON.parse(fs.readFileSync(seedPath, 'utf8'));
                const stmt = db.prepare(`INSERT OR REPLACE INTO levels 
                    (id, config, solution, par, fitness, claustrophobia, tactical_friction, map_cell, entropy_score, tension_score, counterplay_score) 
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
                
                seedData.forEach(lvl => {
                  stmt.run(
                    lvl.id,
                    typeof lvl.config === 'string' ? lvl.config : JSON.stringify(lvl.config),
                    typeof lvl.solution === 'string' ? lvl.solution : JSON.stringify(lvl.solution || []),
                    lvl.par || 18,
                    lvl.fitness || 0,
                    lvl.claustrophobia || 0,
                    lvl.tactical_friction || 0,
                    lvl.map_cell || 'archival',
                    lvl.entropy_score || 0,
                    lvl.tension_score || 0,
                    lvl.counterplay_score || 0
                  );
                });
                stmt.finalize();
                console.log(`[Database Seed] Populated ${seedData.length} MAP-Elites evolved levels from seed-levels.json`);
              } catch (seedErr) {
                console.error("[Database Seed] Error seeding levels:", seedErr.message);
              }
            }
          }
        });
      });
    });
  }
});

function logEvent(sessionId, eventType, data) {
  const stmt = db.prepare('INSERT INTO telemetry (sessionId, event_type, data) VALUES (?, ?, ?)');
  stmt.run(sessionId, eventType, JSON.stringify(data), function(err) {
    if (err) console.error('Error logging event:', err);
  });
  stmt.finalize();
}

module.exports = {
  db,
  logEvent
};
