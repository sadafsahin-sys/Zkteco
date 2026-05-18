const express = require('express');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors());

const dbUrl = process.env.DATABASE_URL;
const JWT_SECRET = process.env.JWT_SECRET || 'rubber_board_secret_key_2026';

// কানেকশন টাইমআউট সহ ডেটাবেজ পুল কনফিগারেশন
const pool = new Pool({
  connectionString: dbUrl,
  ssl: dbUrl ? { rejectUnauthorized: false } : false,
  connectionTimeoutMillis: 5000, // ৫ সেকেন্ড টাইমআউট
  idleTimeoutMillis: 30000
});

// ডাটাবেজ টেবিল ইনিশিয়ালাইজেশন ফাংশন
async function initDatabase() {
  let client;
  try {
    client = await pool.connect();
    console.log('Successfully connected to PostgreSQL Database.');
    
    // ১. কর্মচারীদের টেবিল
    await client.query(`
      CREATE TABLE IF NOT EXISTS employees (
        id VARCHAR(50) PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        designation VARCHAR(100),
        department VARCHAR(100)
      );
    `);

    // ২. ইউজার লগইন টেবিল
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        role VARCHAR(20) DEFAULT 'co-admin'
      );
    `);

    // ৩. হাজিরার টেবিল
    await client.query(`
      CREATE TABLE IF NOT EXISTS attendance (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR(50) NOT NULL,
        timestamp TIMESTAMP NOT NULL,
        status VARCHAR(20) DEFAULT 'Present',
        added_by VARCHAR(50) DEFAULT 'Machine'
      );
    `);

    // ডিফল্ট ইউজার চেক ও ইনসার্ট
    const userCheck = await client.query('SELECT COUNT(*) FROM users');
    if (parseInt(userCheck.rows[0].count) === 0) {
      const adminPass = await bcrypt.hash('admin123', 10);
      const coAdminPass = await bcrypt.hash('coadmin123', 10);
      
      await client.query("INSERT INTO users (username, password_hash, role) VALUES ('admin', $1, 'admin')", [adminPass]);
      for (let i = 1; i <= 4; i++) {
        await client.query("INSERT INTO users (username, password_hash, role) VALUES ($1, $2, 'co-admin')", [`co_admin${i}`, coAdminPass]);
      }
      console.log('Default accounts initialized.');
    }
  } catch (err) {
    console.error('Database Init Error, retrying in 5 seconds...', err.message);
    setTimeout(initDatabase, 5000); // ব্যর্থ হলে ৫ সেকেন্ড পর আবার চেষ্টা করবে
  } finally {
    if (client) client.release();
  }
}

initDatabase();

// ==================== এপিআই মডিউলসমূহ ====================

app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
    if (result.rows.length === 0) return res.status(401).json({ error: 'ইউজারনেম পাওয়া যায়নি' });

    const user = result.rows[0];
    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) return res.status(401).json({ error: 'ভুল পাসওয়ার্ড!' });

    const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '24h' });
    res.json({ message: 'Login successful', token, role: user.role, username: user.username });
  } catch (err) {
    res.status(500).json({ error: 'ডাটাবেজ কানেকশন ওভারলোড, আবার চেষ্টা করুন।' });
  }
});

app.post('/api/attendance', async (req, res) => {
  const { user_id, timestamp } = req.body;
  if (!user_id || !timestamp) return res.status(400).json({ error: 'Missing data' });
  try {
    const empCheck = await pool.query('SELECT id FROM employees WHERE id = $1', [user_id]);
    if (empCheck.rows.length === 0) {
      await pool.query('INSERT INTO employees (id, name, designation, department) VALUES ($1, $2, $3, $4)', [user_id, `Employee ${user_id}`, 'Not Set', 'Not Set']);
    }
    const result = await pool.query('INSERT INTO attendance(user_id, timestamp, status, added_by) VALUES($1, $2, $3, $4) RETURNING *', [user_id, timestamp, 'Present', 'Machine']);
    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/attendance/list', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT a.id, a.user_id, e.name, e.designation, e.department, a.timestamp, a.status, a.added_by 
      FROM attendance a
      LEFT JOIN employees e ON a.user_id = e.id
      ORDER BY a.timestamp DESC LIMIT 200;
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/employees', async (req, res) => {
  const { id, name, designation, department } = req.body;
  try {
    const result = await pool.query(
      'INSERT INTO employees (id, name, designation, department) VALUES ($1, $2, $3, $4) ON CONFLICT (id) DO UPDATE SET name=$2, designation=$3, department=$4 RETURNING *',
      [id, name, designation, department]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/dashboard', (req, res) => {
  res.send('<h1 style="text-align:center; padding-top:50px; color:#4CAF50;">API Gateway is Active 🚀</h1>');
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});