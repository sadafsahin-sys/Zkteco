const express = require('express');
const { Pool } = require('pg');
const app = express();
app.use(express.json());

// আপনার Render Database URL-টি এখানে বসবে (অথবা Environment Variable হিসেবে সেট করবেন)
// আপনার server.js ফাইলের এই অংশটুকু এভাবে আপডেট করুন:
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false // ক্লাউড ডাটাবেজে সিকিউর কানেকশনের জন্য এটি বাধ্যতামূলক
  }
});createTable();

// এই URL-এ লোকাল এজেন্ট ডেটা পাঠাবে (POST Request)
app.post('/api/attendance', async (req, res) => {
  const { user_id, timestamp } = req.body;
  
  try {
    // ডাটাবেজে ইনসার্ট করা হচ্ছে (ডুপ্লিকেট হলে ইগনোর করবে)
    await pool.query(
      'INSERT INTO logs (user_id, timestamp) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [user_id, timestamp]
    );
    res.status(201).json({ message: 'Data saved successfully!' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});