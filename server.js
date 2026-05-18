const express = require('express');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors());

// Render-এর Environment Variable থেকে ডেটাবেজ কানেকশন নেওয়া
const dbUrl = process.env.DATABASE_URL;
const JWT_SECRET = process.env.JWT_SECRET || 'rubber_board_secret_key_2026';

const pool = new Pool({
  connectionString: dbUrl,
  ssl: dbUrl ? { rejectUnauthorized: false } : false
});

// ডাটাবেজ টেবিলগুলো অটোমেটিক তৈরি করার মাস্টার ফাংশন
pool.connect(async (err, client, release) => {
  if (err) {
    return console.error('Database connection failed:', err.stack);
  }
  console.log('Successfully connected to PostgreSQL.');
  
  try {
    // ১. কর্মচারীদের টেবিল (ZKTeco User ID এর সাথে মিল রেখে)
    await client.query(`
      CREATE TABLE IF NOT EXISTS employees (
        id VARCHAR(50) PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        designation VARCHAR(100),
        department VARCHAR(100)
      );
    `);

    // ২. অ্যাডমিন ও ৪ জন কো-অ্যাডমিন লগইন টেবিল
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        role VARCHAR(20) DEFAULT 'co-admin'
      );
    `);

    // ৩. নতুন অ্যাডভান্সড অ্যাটেনডেন্স টেবিল
    await client.query(`
      CREATE TABLE IF NOT EXISTS attendance (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR(50) NOT NULL,
        timestamp TIMESTAMP NOT NULL,
        status VARCHAR(20) DEFAULT 'Present',
        added_by VARCHAR(50) DEFAULT 'Machine'
      );
    `);

    // ডিফল্ট সুপার অ্যাডমিন এবং ৪ জন কো-অ্যাডমিন অটো তৈরি করা (যদি না থাকে)
    const userCheck = await client.query('SELECT COUNT(*) FROM users');
    if (parseInt(userCheck.rows[0].count) === 0) {
      const adminPass = await bcrypt.hash('admin123', 10);
      const coAdminPass = await bcrypt.hash('coadmin123', 10);
      
      // ১ জন সুপার অ্যাডমিন (Username: admin | Password: admin123)
      await client.query("INSERT INTO users (username, password_hash, role) VALUES ('admin', $1, 'admin')", [adminPass]);
      
      // ৪ জন ডিফল্ট কো-অ্যাডমিন অ্যাকাউন্ট (Username: co_admin1 থেকে co_admin4 | Password: coadmin123)
      for (let i = 1; i <= 4; i++) {
        await client.query("INSERT INTO users (username, password_hash, role) VALUES ($1, $2, 'co-admin')", [`co_admin${i}`, coAdminPass]);
      }
      console.log('Default Admin and 4 Co-Admins created successfully.');
    }

    console.log('All database tables are initialized and scalable.');
  } catch (tableErr) {
    console.error('Error creating infrastructure tables:', tableErr);
  } finally {
    release();
  }
});

// ==================== এপিআই মডিউল (API MODULES) ====================

// ১. সিকিউর লগইন এপিআই (মোবাইল অ্যাপের লগইন স্ক্রিনের জন্য)
app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
    if (result.rows.length === 0) return res.status(401).json({ error: 'User not found' });

    const user = result.rows[0];
    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) return res.status(401).json({ error: 'Incorrect password' });

    const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '24h' });
    res.json({ message: 'Login successful', token, role: user.role, username: user.username });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ২. জەکەটেকো মেশিন থেকে ডেটা রিসিভ করার এন্ডপয়েন্ট (মেশিন পাঞ্চ)
app.post('/api/attendance', async (req, res) => {
  const { user_id, timestamp } = req.body;
  if (!user_id || !timestamp) return res.status(400).json({ error: 'Missing user_id or timestamp' });

  try {
    // কর্মচারী টেবিলে আইডিটি আগে থেকেই এন্ট্রি করা আছে কি না চেক করা, না থাকলে অটো-ক্রিয়াট করা
    const empCheck = await pool.query('SELECT id FROM employees WHERE id = $1', [user_id]);
    if (empCheck.rows.length === 0) {
      await pool.query('INSERT INTO employees (id, name, designation, department) VALUES ($1, $2, $3, $4)', [user_id, `Employee ${user_id}`, 'Not Set', 'Not Set']);
    }

    const queryText = 'INSERT INTO attendance(user_id, timestamp, status, added_by) VALUES($1, $2, $3, $4) RETURNING *';
    const result = await pool.query(queryText, [user_id, timestamp, 'Present', 'Machine']);
    res.status(201).json({ message: 'Recorded', data: result.rows[0] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ৩. বিস্তারিত হাজিরার ডেটা দেখার গেটওয়ে (মোবাইল অ্যাপ ও ড্যাশবোর্ডের জন্য)
app.get('/api/attendance/list', async (req, res) => {
  try {
    // Attendance এবং Employees টেবিল JOIN করে নাম, পদবীসহ বিস্তারিত তথ্য আনা
    const query = `
      SELECT a.id, a.user_id, e.name, e.designation, e.department, a.timestamp, a.status, a.added_by 
      FROM attendance a
      LEFT JOIN employees e ON a.user_id = e.id
      ORDER BY a.timestamp DESC LIMIT 200;
    `;
    const result = await pool.query(query);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ৪. নতুন কর্মচারী যুক্ত বা আপডেট করার এপিআই (CRUD - Create/Update)
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

// ৫. ম্যানুয়ালি কোনো হাজিরা রেকর্ড ডিলিট করার এপিআই (CRUD - Delete)
app.delete('/api/attendance/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM attendance WHERE id = $1', [id]);
    res.json({ message: 'Attendance record deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// কোর এপিআই গেটওয়ে ট্র্যাকিং রুট
app.get('/dashboard', (req, res) => {
  res.send(`
    <div style="text-align: center; font-family: sans-serif; padding-top: 50px;">
      <h1 style="color: #4CAF50;">Rubber Board Core API Gateway is Running Live 🚀</h1>
      <p style="font-size: 18px; color: #555;">মোবাইল অ্যাপ্লিকেশন এবং অ্যাডমিন প্যানেল এখন এই গেটওয়ের সাথে যুক্ত হতে প্রস্তুত।</p>
    </div>
  `);
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});