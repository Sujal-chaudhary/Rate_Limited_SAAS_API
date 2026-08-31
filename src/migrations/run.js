import pool from '../config/db.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const sql = fs.readFileSync(path.join(__dirname, '001_create_tables.sql'), 'utf8');

const run = async() => {
    try {
        await pool.query(sql);
        console.log("migration successfull");
        
    } catch (error) {
        console.error('migration failed', error);
    } finally{
        await pool.end();
    }
};

run();

