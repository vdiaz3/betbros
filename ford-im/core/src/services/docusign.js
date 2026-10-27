// DocuSign eSignature REST v2.1 con autenticación JWT Grant (sin SDK).
// Flujo: crear sobre con firma incrustada (clientUserId) → el cliente abre
// firma.menteia.com/s/<token> → generamos la "recipient view" (caduca en minutos, por eso no
// se manda directa por WhatsApp) → DocuSign Connect avisa "completed" a /webhook.
import crypto from 'node:crypto';
import { config } from '../config.js';
import { ANCHORS } from './forms.js';

const ds = () => config.docusign;
export const docusignEnabled = () => Boolean(ds().integrationKey && ds().userId && ds().privateKey && ds().accountId);

let cached = { token: null, exp: 0, baseUri: null };

function jwtAssertion() {
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const iat = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(JSON.stringify({
    iss: ds().integrationKey, sub: ds().userId, aud: ds().authServer, iat, exp: iat + 3600, scope: 'signature impersonation',
  })).toString('base64url');
  const sig = crypto.sign('RSA-SHA256', Buffer.from(`${header}.${payload}`), ds().privateKey).toString('base64url');
  return `${header}.${payload}.${sig}`;
}

async function auth() {
  if (cached.token && cached.exp > Date.now() + 60_000) return cached;
  const res = await fetch(`https://${ds().authServer}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwtAssertion() }),
  });
  const json = await res.json();
  if (!res.ok) throw Object.assign(new Error(`docusign_auth: ${JSON.stringify(json)} (¿consentimiento del usuario otorgado?)`), { status: 424 });
  if (!cached.baseUri) {
    const info = await (await fetch(`https://${ds().authServer}/oauth/userinfo`, { headers: { Authorization: `Bearer ${json.access_token}` } })).json();
    const acct = info.accounts?.find((a) => a.account_id === ds().accountId) || info.accounts?.find((a) => a.is_default);
    cached.baseUri = `${acct.base_uri}/restapi/v2.1/accounts/${ds().accountId}`;
  }
  cached = { ...cached, token: json.access_token, exp: Date.now() + json.expires_in * 1000 };
  return cached;
}

async function api(method, p, body, { raw = false } = {}) {
  const { token, baseUri } = await auth();
  const res = await fetch(`${baseUri}${p}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw Object.assign(new Error(`docusign ${res.status}: ${await res.text()}`), { status: 424 });
  return raw ? Buffer.from(await res.arrayBuffer()) : res.json();
}

const anchorTab = (anchorString, extra = {}) => ({ anchorString, anchorUnits: 'pixels', anchorXOffset: '0', anchorYOffset: '-4', ...extra });

export async function createEnvelope({ credit, signer, pdf, webhookUrl, lang = 'es' }) {
  const body = {
    emailSubject: (config.demoMode ? '[DEMO] ' : '') + (lang === 'en' ? `Financing application ${credit.folio}` : `Solicitud de crédito ${credit.folio}`),
    documents: [{ documentBase64: pdf.toString('base64'), name: `Solicitud-${credit.folio}.pdf`, fileExtension: 'pdf', documentId: '1' }],
    recipients: {
      signers: [{
        email: signer.email,
        name: signer.name,
        recipientId: '1',
        routingOrder: '1',
        clientUserId: signer.clientUserId, // firma incrustada
        tabs: {
          signHereTabs: [anchorTab(ANCHORS.sign), anchorTab(ANCHORS.buroSign)],
          dateSignedTabs: [anchorTab(ANCHORS.date), anchorTab(ANCHORS.buroDate)],
        },
      }],
    },
    customFields: { textCustomFields: [{ name: 'folio', value: credit.folio, show: 'false' }] },
    eventNotification: {
      url: webhookUrl,
      requireAcknowledgment: 'true',
      loggingEnabled: 'true',
      deliveryMode: 'SIM',
      events: ['envelope-completed', 'envelope-declined', 'envelope-voided'],
      eventData: { version: 'restv2.1', format: 'json', includeData: ['custom_fields'] },
    },
    status: 'sent',
  };
  const json = await api('POST', '/envelopes', body);
  return json.envelopeId;
}

export async function recipientViewUrl({ envelopeId, signer, returnUrl }) {
  const json = await api('POST', `/envelopes/${envelopeId}/views/recipient`, {
    returnUrl, authenticationMethod: 'none', email: signer.email, userName: signer.name, clientUserId: signer.clientUserId,
  });
  return json.url;
}

export const downloadCombined = (envelopeId) => api('GET', `/envelopes/${envelopeId}/documents/combined?certificate=true`, null, { raw: true });

// DocuSign Connect firma el cuerpo con HMAC-SHA256 (cabecera X-DocuSign-Signature-1).
export function verifyConnectSignature(rawBody, header) {
  if (!ds().connectHmacKey) return true; // sin llave configurada no se valida (sólo en desarrollo)
  if (!header) return false;
  const expected = crypto.createHmac('sha256', ds().connectHmacKey).update(rawBody).digest('base64');
  const a = Buffer.from(expected);
  const b = Buffer.from(header);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
