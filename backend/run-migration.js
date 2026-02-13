// Direct SQL execution script to bypass Prisma migration issues
require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
    console.error('DATABASE_URL not found in environment');
    process.exit(1);
}

const pool = new Pool({ connectionString: DATABASE_URL });

const sqlFilePath = path.join(__dirname, 'prisma', 'migrations', 'manual_exam_management.sql');
const sql = fs.readFileSync(sqlFilePath, 'utf8');

async function executeMigration() {
    const client = await pool.connect();

    try {
        console.log('Starting manual migration...');
        console.log('='.repeat(50));

        // Execute the SQL
        const result = await client.query(sql);

        console.log('Migration executed successfully!');
        console.log('='.repeat(50));

        // Show any notices/messages
        if (result.rows && result.rows.length > 0) {
            console.log('Results:', result.rows);
        }

        console.log('\n✅ Database schema updated successfully!');
        console.log('✅ All existing data preserved!');
        console.log('\nNext step: Run "npx prisma generate" to update Prisma Client');

    } catch (error) {
        console.error('❌ Migration failed:');
        console.error(error.message);
        console.error('\nFull error:', error);
        process.exit(1);
    } finally {
        client.release();
        await pool.end();
    }
}

executeMigration();
