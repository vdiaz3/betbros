// Métricas del funnel (api.menteia.com/admin/metrics). Auth: Bearer ADMIN_API_KEY.
import express from 'express';
import { requireAdmin } from '../lib/auth.js';
import { getDb } from '../db.js';

const r = express.Router();
const FUNNEL = ['qr_scanned', 'chat_started', 'greeting_sent', 'consent_credit_privacy', 'kyc_submitted', 'credit_started', 'stage_signing', 'sent_to_bank', 'stage_bank_approved'];

r.get('/metrics', requireAdmin, (req, res) => {
  const since = Number(req.query.since || Date.now() - 30 * 86_400_000);
  const db = getDb();
  const counts = Object.fromEntries(db.prepare('SELECT type, COUNT(*) n FROM events WHERE created_at >= ? GROUP BY type').all(since).map((x) => [x.type, x.n]));
  const byKiosk = db.prepare("SELECT kiosk_id, COUNT(*) scans FROM events WHERE type = 'qr_scanned' AND created_at >= ? GROUP BY kiosk_id").all(since);
  const byVehicle = db.prepare("SELECT vehicle_id, COUNT(*) leads FROM sessions WHERE wa_id IS NOT NULL AND created_at >= ? GROUP BY vehicle_id").all(since);
  const lastHeartbeat = db.prepare("SELECT kiosk_id, MAX(created_at) at FROM events WHERE type = 'kiosk_heartbeat' GROUP BY kiosk_id").all();
  res.json({ since, funnel: FUNNEL.map((k) => ({ step: k, count: counts[k] || 0 })), counts, byKiosk, byVehicle, lastHeartbeat });
});
export default r;
