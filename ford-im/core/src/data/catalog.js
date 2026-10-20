import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const read = (f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));

const vehiclesFile = read('vehicles.json');
export const vehicles = vehiclesFile.vehicles;
// Reseña destacada que se comparte en la bienvenida de WhatsApp (YouTube).
export const featuredReview = vehiclesFile.featured_review || null;
export const { dealers, kiosks } = read('dealers.json');
// ENABLED_BANKS=bbva limita los bancos que ofrece el agente (útil para la demo con un solo banco).
const enabledBanks = (process.env.ENABLED_BANKS || '').split(',').map((s) => s.trim()).filter(Boolean);
export const banks = read('banks.json').banks.filter((b) => !enabledBanks.length || enabledBanks.includes(b.id));

export const getVehicle = (id) => vehicles.find((v) => v.id === id) || null;
export const getDealer = (id) => dealers.find((d) => d.id === id) || null;
export const getKiosk = (id) => kiosks.find((k) => k.id === id) || null;
export const getBank = (id) => banks.find((b) => b.id === id) || null;
