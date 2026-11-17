import { holidayDB } from '../lib/db';

const count = holidayDB.seed();
process.stdout.write(`Holidays in database: ${count}\n`);
