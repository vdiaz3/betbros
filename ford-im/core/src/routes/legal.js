// legal.menteia.com: avisos de privacidad (simplificado, integral y de crédito) y términos.
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../config.js';
import { normLang } from '../lib/i18n.js';
import { esc } from '../lib/html.js';

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../public/legal');
const DOCS = ['privacidad', 'privacidad-credito', 'terminos'];
const r = express.Router();

r.get('/', (req, res) => res.redirect(302, `/privacidad?lang=${normLang(req.query.lang)}`));
r.get('/:doc', (req, res, next) => {
  if (!DOCS.includes(req.params.doc)) return next();
  const lang = normLang(req.query.lang);
  const file = path.join(dir, `${req.params.doc}.${lang}.html`);
  const html = fs.readFileSync(file, 'utf8')
    .replaceAll('{{RESPONSABLE}}', esc(config.legal.controllerName))
    .replaceAll('{{DOMICILIO}}', esc(config.legal.controllerAddress))
    .replaceAll('{{EMAIL_PRIVACIDAD}}', esc(config.legal.privacyEmail))
    .replaceAll('{{VERSION}}', esc(req.params.doc === 'privacidad-credito' ? config.legal.creditPrivacyVersion : config.legal.privacyVersion));
  res.type('html').send(html);
});
export default r;
