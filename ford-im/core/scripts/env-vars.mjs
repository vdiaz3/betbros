// Catálogo de variables por servicio (fuente única para write-env y check-env).
export const SERVICES = [
  { id: 'core', label: 'Ford IM (núcleo)', vars: [
    ['SINGLE_HOST', 'cotizador.menteia.com', false], ['DEMO_MODE', 'true', false], ['DEMO_SEED', 'true', false],
    ['APP_SECRET', null, true], ['N8N_API_KEY', null, true], ['ADMIN_API_KEY', null, true],
    ['KIOSK_KEYS', null, true], ['ENABLED_BANKS', 'bbva', false], ['CRM_VIEW_KEY', null, true], ['ACME_EMAIL', null, false],
    ['LEGAL_CONTROLLER_NAME', null, false], ['LEGAL_CONTROLLER_ADDRESS', null, false], ['LEGAL_PRIVACY_EMAIL', null, false],
  ] },
  { id: 'whatsapp', label: 'WhatsApp Cloud API', vars: [
    ['WA_DISPLAY_NUMBER', null, false], ['WA_PHONE_NUMBER_ID', null, false], ['WA_ACCESS_TOKEN', null, true], ['WA_GRAPH_VERSION', 'v23.0', false],
  ] },
  { id: 'n8n', label: 'n8n', vars: [['N8N_BASE_URL', null, false], ['N8N_API_TOKEN', null, true]] },
  { id: 'elevenlabs', label: 'ElevenLabs', vars: [
    ['ELEVENLABS_API_KEY', null, true], ['ELEVENLABS_KIOSK_AGENT_ID', null, false], ['ELEVENLABS_VOICE_ES', null, false], ['ELEVENLABS_VOICE_EN', null, false],
  ] },
  { id: 'docusign', label: 'DocuSign (demo: cuenta de desarrollador)', vars: [
    ['DOCUSIGN_AUTH_SERVER', 'account-d.docusign.com', false], ['DOCUSIGN_INTEGRATION_KEY', null, false], ['DOCUSIGN_USER_ID', null, false],
    ['DOCUSIGN_ACCOUNT_ID', null, false], ['DOCUSIGN_PRIVATE_KEY_B64', null, true], ['DOCUSIGN_CONNECT_HMAC_KEY', null, true],
  ] },
  { id: 'mail', label: 'Correo (SMTP)', vars: [
    ['SMTP_URL', null, true], ['MAIL_FROM', 'Ford IM <credito@menteia.com>', false], ['BANK_EMAIL_OVERRIDE', null, false], ['BANK_DELIVERY_MODE', 'secure_link', false],
  ] },
  { id: 'sheets', label: 'Google Sheets (CSV publicados)', vars: [['SHEET_VEHICLES_CSV', null, false], ['SHEET_PRICES_CSV', null, false], ['SHEET_PROMOS_CSV', null, false]] },
  { id: 'crm', label: 'CRM operativo (opcional: Twenty)', vars: [['CRM_BASE_URL', null, false], ['CRM_API_KEY', null, true], ['SELLER_USERS', null, true]] },
];
