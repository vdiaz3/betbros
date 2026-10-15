import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const read = (f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));

export const vehicles = read('vehicles.json').vehicles;
export const { dealers, kiosks } = read('dealers.json');
export const banks = read('banks.json').banks;

export const getVehicle = (id) => vehicles.find((v) => v.id === id) || null;
export const getDealer = (id) => dealers.find((d) => d.id === id) || null;
export const getKiosk = (id) => kiosks.find((k) => k.id === id) || null;
export const getBank = (id) => banks.find((b) => b.id === id) || null;
