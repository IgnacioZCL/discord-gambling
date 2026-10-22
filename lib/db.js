const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dataDir = path.join(__dirname, '..', 'data');
try {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true, mode: 0o755 });
  }
} catch (error) {
  console.error(`Failed to create database directory ${dataDir}:`, error);
  throw error;
}

const dbPath = process.env.ECONOMY_DB_PATH || path.join(dataDir, 'economy.db');

// Log the resolved database path to aid debugging permission issues.
console.log(`[db] Opening SQLite database at: ${dbPath}`);

let db;
try {
  db = new Database(dbPath);
} catch (error) {
  console.error(`[db] Failed to open SQLite database at ${dbPath}:`, error);
  throw error;
}

// Enable WAL for better concurrency and performance.
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Users table: one wallet per Discord user.
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    user_id TEXT PRIMARY KEY,
    balance INTEGER NOT NULL DEFAULT 0,
    last_claim_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// Transactions table: immutable history of every movement.
db.exec(`
  CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    amount INTEGER NOT NULL,
    type TEXT NOT NULL,
    game TEXT,
    description TEXT,
    balance_after INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(user_id)
  );
`);

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_transactions_user_id
  ON transactions(user_id);
`);

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_transactions_created_at
  ON transactions(created_at);
`);

module.exports = db;
