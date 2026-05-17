const express = require('express');
const { Pool } = require('pg');

const app = express();
app.use(express.json());

// Render ক্লাউড ডাটাবেজ কানেকশন (SSL সহ)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// ডাটাবেজে টেবিল তৈরি করার ফাংশন
const createTable = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS logs (
        id SERIAL PRIMARY KEY,
        user_id INT NOT NULL,
        timestamp TIMESTAMP NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log("Database table 'logs' is ready.");
  } catch (err) {
    console.error("Error creating table:", err);
  }
};

// সার্ভার চালু হওয়ার সময় টেবিল তৈরি হবে
createTable();

// লোকাল এজেন্ট থেকে হাজিরা ডেটা রিসিভ করার রুট
app.post('/api/attendance', async (req, res) => {
  const { user_id, timestamp } = req.body;

  try {
    await pool.query(
      'INSERT INTO logs (user_id, timestamp) VALUES ($1, $2)',
      [user_id, timestamp]
    );
    res.status(201).json({ message: 'Data saved successfully!' });
  } catch (err) {
    console.error("Error inserting data:", err);
    res.status(500).json({ error: 'Database error' });
  }
});

// Render-এর দেওয়া পোর্টে অথবা ডিফল্ট ৩০ Wakte সার্ভার রান হবে
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});