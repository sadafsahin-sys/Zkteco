const express = require('express');
const { Pool } = require('pg');
const app = express();

app.use(express.json());

// Render-এর Environment Variable থেকে সরাসরি ডাটাবেজ কানেক্ট করা
const dbUrl = process.env.DATABASE_URL;

const pool = new Pool({
  connectionString: dbUrl,
  ssl: dbUrl ? { rejectUnauthorized: false } : false
});

// ডাটাবেজ কানেকশন চেক এবং অটোমেটিক টেবিল তৈরি করা
pool.connect(async (err, client, release) => {
  if (err) {
    return console.error('Database connection failed:', err.stack);
  }
  console.log('Successfully connected to the PostgreSQL database.');
  
  try {
    // attendance টেবিল না থাকলে তা অটো তৈরি করার কুয়েরি
    const createTableQuery = `
      CREATE TABLE IF NOT EXISTS attendance (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR(50) NOT NULL,
        timestamp TIMESTAMP NOT NULL
      );
    `;
    await client.query(createTableQuery);
    console.log('Attendance table is ready or already exists.');
  } catch (tableErr) {
    console.error('Error creating table:', tableErr);
  } finally {
    release();
  }
});

// ১. পাইথন এজেন্ট থেকে ডেটা রিসিভ করার রুট
app.post('/api/attendance', async (req, res) => {
  const { user_id, timestamp } = req.body;

  if (!user_id || !timestamp) {
    return res.status(400).json({ error: 'Missing user_id or timestamp' });
  }

  try {
    const queryText = 'INSERT INTO attendance(user_id, timestamp) VALUES($1, $2) RETURNING *';
    const values = [user_id, timestamp];
    
    const result = await pool.query(queryText, values);
    console.log(`Successfully saved attendance for User: ${user_id}`);
    
    res.status(201).json({ message: 'Attendance recorded successfully', data: result.rows[0] });
  } catch (error) {
    console.error('Error inserting data into database:', error);
    res.status(500).json({ error: 'Internal Server Error', details: error.message });
  }
});

// ২. রিমোট পজিশন থেকে লাইভ ডেটা দেখার সুন্দর ড্যাশবোর্ড রুট
app.get('/dashboard', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM attendance ORDER BY timestamp DESC LIMIT 100');
    const rows = result.rows;

    let html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>ZKTeco Live Attendance Dashboard</title>
        <style>
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f7f6; margin: 0; padding: 20px; }
            .container { max-width: 900px; margin: 0 auto; background: #fff; padding: 20px; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
            h2 { color: #333; border-bottom: 2px solid #4CAF50; padding-bottom: 10px; margin-top: 0; }
            .refresh-btn { background-color: #4CAF50; color: white; border: none; padding: 10px 20px; font-size: 14px; border-radius: 4px; cursor: pointer; float: right; }
            .refresh-btn:hover { background-color: #45a049; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th, td { padding: 12px; text-align: left; border-bottom: 1px solid #ddd; }
            th { background-color: #f2f2f2; color: #333; }
            tr:hover { background-color: #f9f9f9; }
            .badge { background-color: #e1f5fe; color: #0288d1; padding: 5px 10px; border-radius: 4px; font-weight: bold; }
        </style>
        <script>
            setInterval(function(){ location.reload(); }, 10000);
        </script>
    </head>
    <body>
        <div class="container">
            <button class="refresh-btn" onclick="location.reload()">Refresh Live</button>
            <h2>🔴 ZKTeco Live Attendance Dashboard</h2>
            <p>নিচে অফিসের সর্বশেষ হাজিরার লাইভ ডেটা দেখানো হচ্ছে (প্রতি ১০ সেকেন্ড পর পর অটো-রিফ্রেশ হবে):</p>
            <table>
                <thead>
                    <tr>
                        <th>SL</th>
                        <th>User ID (Machine)</th>
                        <th>Punch Time & Date</th>
                        <th>Status</th>
                    </tr>
                </thead>
                <tbody>
    `;

    if(rows.length === 0) {
        html += `<tr><td colspan="4" style="text-align:center; color: #888;">এখনো কোনো হাজিরার ডেটা পাওয়া যায়নি।</td></tr>`;
    } else {
        rows.forEach((row, index) => {
            html += `
                <tr>
                    <td>${index + 1}</td>
                    <td><span class="badge">User - ${row.user_id}</span></td>
                    <td><strong>${row.timestamp}</strong></td>
                    <td style="color: green; font-weight: bold;">✓ Success</td>
                </tr>
            `;
        });
    }

    html += `
                </tbody>
            </table>
        </div>
    </body>
    </html>
    `;

    res.send(html);
  } catch (error) {
    res.status(500).send("Dashboard Error: " + error.message);
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`Render Server is running live on port ${PORT}`);
});