import './helpers.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { signToken, verifyToken } from '../src/lib/token.js';
import { isValidCurp, isValidRfc, simulate } from '../src/services/credit.js';
import { parseCsv, isPromoActive } from '../src/services/sheets.js';
import { extractRef } from '../src/services/sessions.js';
import { splitForVoice } from '../src/services/voice.js';
import { t, detectLangSwitch } from '../src/lib/i18n.js';

test('tokens firmados: válido, propósito incorrecto, alterado y vencido', () => {
  const tok = signToken('kyc', { k: 'abc' }, 60);
  assert.equal(verifyToken(tok, 'kyc').k, 'abc');
  assert.equal(verifyToken(tok, 'sign'), null);
  assert.equal(verifyToken(tok.slice(0, -2) + 'xx', 'kyc'), null);
  assert.equal(verifyToken(signToken('kyc', {}, -1), 'kyc'), null);
});

test('CURP con dígito verificador y RFC', () => {
  assert.ok(isValidCurp('HEGG560427MVZRRL04')); // ejemplo público con dígito verificador correcto
  assert.ok(!isValidCurp('HEGG560427MVZRRL05'));
  assert.ok(!isValidCurp('XXXX'));
  assert.ok(isValidRfc('GODE561231GR8'));
  assert.ok(!isValidRfc('GODE5612'));
});

test('simulador: pago mensual con IVA sobre intereses', () => {
  const s = simulate({ price: 500000, downPayment: 100000, termMonths: 48, ratePct: 12, ivaOnInterest: true });
  assert.equal(s.principal, 400000);
  assert.ok(s.monthly_payment > 10500 && s.monthly_payment < 11000, String(s.monthly_payment));
  const zero = simulate({ price: 120, downPayment: 0, termMonths: 12, ratePct: 0 });
  assert.equal(zero.monthly_payment, 10);
});

test('CSV con comillas, comas y saltos de línea', () => {
  const rows = parseCsv('vehicle_id,titulo_es\r\nbronco,"Tasa 0%, 12 meses"\nranger,"dice ""hola"""\n');
  assert.deepEqual(rows, [{ vehicle_id: 'bronco', titulo_es: 'Tasa 0%, 12 meses' }, { vehicle_id: 'ranger', titulo_es: 'dice "hola"' }]);
  assert.ok(isPromoActive({ vigencia_inicio: '2026-01-01', vigencia_fin: '2026-12-31' }, '2026-10-15'));
  assert.ok(!isPromoActive({ vigencia_fin: '2026-09-30' }, '2026-10-15'));
});

test('ref del mensaje pre-llenado, voz e idioma', () => {
  assert.equal(extractRef(t('es', 'prefill', { vehicle: 'Ford Bronco', ref: 'AB2CD3' })), 'AB2CD3');
  assert.equal(extractRef('hola'), null);
  const v = splitForVoice('Mira *aquí*: https://legal.menteia.com/x y listo');
  assert.deepEqual(v.links, ['https://legal.menteia.com/x']);
  assert.ok(!v.spoken.includes('http') && !v.spoken.includes('*'));
  assert.equal(detectLangSwitch('English'), 'en');
  assert.equal(detectLangSwitch('Español'), 'es');
  assert.equal(detectLangSwitch('quiero info'), null);
});

test('la info del vehículo incluye la ficha de referencia aunque no haya Sheet', async () => {
  const { vehicleInfo } = await import('../src/services/sheets.js');
  const info = await vehicleInfo('territory', 'es');
  assert.match(info.reference.versiones, /Titanium Híbrida HEV/);
  assert.match(info.reference.precio_desde, /569,900/);
  assert.ok(info.review.url.includes('youtube.com'));
  assert.equal(info.prices.length, 0);
});
