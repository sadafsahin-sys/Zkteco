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