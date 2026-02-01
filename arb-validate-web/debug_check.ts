
import fs from 'fs';
import path from 'path';

// Load .env manually
const envPath = path.resolve(process.cwd(), '.env');
console.log('Loading .env from:', envPath);
if (fs.existsSync(envPath)) {
    const envConfig = fs.readFileSync(envPath, 'utf-8');
    envConfig.split('\n').forEach(line => {
        const match = line.match(/^([^=]+)=(.*)$/);
        if (match) {
            const key = match[1].trim();
            const value = match[2].trim().replace(/^["']|["']$/g, '');
            process.env[key] = value;
        }
    });
}

console.log('DATABASE_URL defined:', !!process.env.DATABASE_URL);
console.log('DIRECT_URL defined:', !!process.env.DIRECT_URL);

import { PrismaClient } from '@prisma/client';

async function main() {
    console.log('Initializing Prisma...');
    const prisma = new PrismaClient();
    try {
        console.log('Connecting to DB...');
        await prisma.$connect();
        console.log('Connected to DB successfully.');
        const count = await prisma.pair.count();
        console.log('Pair count:', count);
    } catch (e) {
        console.error('DB Connection error:', e);
    } finally {
        await prisma.$disconnect();
    }
}

main().catch(e => console.error('Main error:', e));
