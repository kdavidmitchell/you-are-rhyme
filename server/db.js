const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, 'telemetry.sqlite');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database', err.message);
  } else {
    console.log('Connected to the SQLite database.');
    db.run(`CREATE TABLE IF NOT EXISTS telemetry (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        sessionId TEXT,
        event_type TEXT,
        data TEXT
    )`);
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
