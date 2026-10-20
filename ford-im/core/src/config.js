// Configuración central. Todo sale de variables de entorno (ver ../../.env.example).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const env = process.env;

// Credenciales guardadas desde la página /admin/secrets (DATA_DIR/secrets.env). Tienen prioridad
// sobre .env y sobreviven a reinicios y actualizaciones del contenedor.
export const SECRETS_FILE = path.join(env.DATA_DIR || path.resolve(here, '../../.data'), 'secrets.env');
try {
  for (const line of fs.readFileSync(SECRETS_FILE, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) env[m[1]] = JSON.parse(m[2]);
  }
} catch { /* sin archivo de secretos */ }

const list = (v) => (v ? v.split(',').map((s) => s.trim()).filter(Boolean) : []);

// KIOSK_KEYS="K-MTY-01:secreto1,K-CDMX-01:secreto2"
const kioskKeys = Object.fromEntries(
  list(env.KIOSK_KEYS).map((pair) => {
    const i = pair.indexOf(':');
    return [pair.slice(0, i), pair.slice(i + 1)];
  }),
);

export const config = {
  env: env.NODE_ENV || 'development',
  port: Number(env.PORT || 3000),
  dataDir: env.DATA_DIR || path.resolve(here, '../../.data'),
  secret: env.APP_SECRET || 'dev-only-secret-change-me',

  // Subdominios (Caddy los enruta todos al mismo contenedor; server.js despacha por Host)
  hosts: {
    kiosk: env.HOST_KIOSK || 'fordim.menteia.com',
    go: env.HOST_GO || 'go.menteia.com',
    api: env.HOST_API || 'api.menteia.com',
    kyc: env.HOST_KYC || 'kyc.menteia.com',
    firma: env.HOST_FIRMA || 'firma.menteia.com',
    bancos: env.HOST_BANCOS || 'bancos.menteia.com',
    legal: env.HOST_LEGAL || 'legal.menteia.com',
    vendedor: env.HOST_VENDEDOR || 'vendedor.menteia.com',
    media: env.HOST_MEDIA || 'media.menteia.com',
  },
  publicScheme: env.PUBLIC_SCHEME || 'https',
  // Modo demo en UN solo subdominio: todo cuelga de cotizador.menteia.com por ruta.
  singleHost: env.SINGLE_HOST || '',

  qr: {
    rotateSeconds: Number(env.QR_ROTATE_SECONDS || 30),
    graceSeconds: Number(env.QR_GRACE_SECONDS || 15),
    refTtlMinutes: Number(env.REF_TTL_MINUTES || 30),
  },
  kioskKeys,

  // CRM de sólo lectura (sin login, sin enviar mensajes). Por defecto activo en modo demo.
  crmReadOnly: env.CRM_READONLY ? env.CRM_READONLY === 'true' : env.DEMO_MODE === 'true',
  // Llave opcional para ver el CRM de sólo lectura (se abre una vez con /crm/?k=LLAVE).
  crmViewKey: env.CRM_VIEW_KEY || '',
  demoSeed: env.DEMO_SEED === 'true',

  // Modo demo: KYC simulado, PDF con marca "DEMO" y todos los correos al banco a BANK_EMAIL_OVERRIDE.
  demoMode: env.DEMO_MODE === 'true',

  // Vendedores del panel vendedor.menteia.com: "usuario:Nombre Visible:llave,..."
  sellers: Object.fromEntries(
    list(env.SELLER_USERS).map((entry) => {
      const [user, name, ...key] = entry.split(':');
      return [user, { user, name, key: key.join(':') }];
    }),
  ),

  n8nApiKey: env.N8N_API_KEY || 'dev-n8n-key',
  adminApiKey: env.ADMIN_API_KEY || 'dev-admin-key',

  whatsapp: {
    displayNumber: env.WA_DISPLAY_NUMBER || '5215500000000', // número en formato wa.me (sin +)
    phoneNumberId: env.WA_PHONE_NUMBER_ID || '',
    token: env.WA_ACCESS_TOKEN || '',
    graphVersion: env.WA_GRAPH_VERSION || 'v23.0',
    templateLang: { es: env.WA_TEMPLATE_LANG_ES || 'es_MX', en: env.WA_TEMPLATE_LANG_EN || 'en_US' },
    templates: {
      bankDecision: env.WA_TEMPLATE_BANK_DECISION || 'ford_im_respuesta_banco',
      signatureDone: env.WA_TEMPLATE_SIGNATURE_DONE || 'ford_im_firma_completa',
      testDriveReminder: env.WA_TEMPLATE_TEST_DRIVE || 'ford_im_recordatorio_prueba',
    },
  },

  elevenlabs: {
    apiKey: env.ELEVENLABS_API_KEY || '',
    kioskAgentId: env.ELEVENLABS_KIOSK_AGENT_ID || '',
    voiceId: { es: env.ELEVENLABS_VOICE_ES || '', en: env.ELEVENLABS_VOICE_EN || '' },
    ttsModel: env.ELEVENLABS_TTS_MODEL || 'eleven_multilingual_v2',
    sttModel: env.ELEVENLABS_STT_MODEL || 'scribe_v1',
  },

  sheets: {
    // URLs CSV ("Publicar en la web" > CSV) de cada pestaña del Google Sheet
    vehiclesCsv: env.SHEET_VEHICLES_CSV || '',
    pricesCsv: env.SHEET_PRICES_CSV || '',
    promosCsv: env.SHEET_PROMOS_CSV || '',
    cacheSeconds: Number(env.SHEETS_CACHE_SECONDS || 300),
  },

  crm: {
    // Twenty CRM self-hosted en crm.menteia.com
    baseUrl: env.CRM_BASE_URL || '',
    apiKey: env.CRM_API_KEY || '',
  },

  kyc: {
    provider: env.KYC_PROVIDER || (env.DEMO_MODE === 'true' ? 'simulated' : 'manual'), // simulated | manual | webhook
    webhookUrl: env.KYC_WEBHOOK_URL || '',
    linkTtlHours: Number(env.KYC_LINK_TTL_HOURS || 24),
  },

  docusign: {
    authServer: env.DOCUSIGN_AUTH_SERVER || 'account-d.docusign.com', // prod: account.docusign.com
    integrationKey: env.DOCUSIGN_INTEGRATION_KEY || '',
    userId: env.DOCUSIGN_USER_ID || '',
    accountId: env.DOCUSIGN_ACCOUNT_ID || '',
    // La llave RSA se acepta tal cual, con \n escapados, o en base64 (más fácil de guardar como secreto).
    privateKey: env.DOCUSIGN_PRIVATE_KEY_B64
      ? Buffer.from(env.DOCUSIGN_PRIVATE_KEY_B64, 'base64').toString('utf8')
      : (env.DOCUSIGN_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
    connectHmacKey: env.DOCUSIGN_CONNECT_HMAC_KEY || '',
  },

  mail: {
    smtpUrl: env.SMTP_URL || '', // smtps://usuario:pass@smtp.menteia.com:465
    from: env.MAIL_FROM || 'Ford IM <credito@menteia.com>',
    bccDealer: list(env.MAIL_BCC_DEALER),
    // attachments = adjunta PDFs (lo pedido); secure_link = liga con caducidad (recomendado)
    bankDeliveryMode: env.BANK_DELIVERY_MODE || 'attachments',
    bankEmailOverride: env.BANK_EMAIL_OVERRIDE || '',
    maxAttachmentMb: Number(env.MAIL_MAX_ATTACHMENT_MB || 20),
  },

  legal: {
    privacyVersion: env.PRIVACY_NOTICE_VERSION || '2026-10-v1',
    creditPrivacyVersion: env.CREDIT_PRIVACY_NOTICE_VERSION || '2026-10-v1',
    controllerName: env.LEGAL_CONTROLLER_NAME || '[RAZÓN SOCIAL DEL DISTRIBUIDOR]',
    controllerAddress: env.LEGAL_CONTROLLER_ADDRESS || '[DOMICILIO]',
    privacyEmail: env.LEGAL_PRIVACY_EMAIL || 'privacidad@menteia.com',
  },
};

// Ruta de cada sitio cuando todo vive en un solo subdominio (SINGLE_HOST).
export const PREFIX = {
  kiosk: '/kiosco', go: '/go', api: '/api', kyc: '/kyc', firma: '/firma',
  bancos: '/bancos', legal: '/legal', vendedor: '/crm', media: '/media',
};

export function publicUrl(hostKey, p = '/') {
  if (config.singleHost) return `${config.publicScheme}://${config.singleHost}${PREFIX[hostKey]}${p}`;
  return `${config.publicScheme}://${config.hosts[hostKey]}${p}`;
}

// Videos y PDFs: URL absoluta tal cual, o ruta relativa servida desde /media.
export const mediaUrl = (u) => (!u || /^https?:\/\//.test(u) ? u : publicUrl('media', `/${u.replace(/^\/+/, '')}`));
