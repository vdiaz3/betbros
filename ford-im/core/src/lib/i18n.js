// Textos fijos del sistema (los que NO genera el agente de IA). Español / inglés.
const messages = {
  es: {
    prefill: ({ vehicle, ref }) => `Hola 👋 Quiero información del ${vehicle}. (ref: ${ref})`,
    welcome: ({ name, vehicle, dealer, privacyUrl }) =>
      `¡Hola${name ? ` ${name}` : ''}! Soy el asistente virtual de ${dealer} 🚙\n` +
      `Te comparto un video del *${vehicle}*.\n\n` +
      `🔒 Antes de continuar, consulta nuestro Aviso de Privacidad conforme a la Ley Federal de Protección de Datos Personales en Posesión de los Particulares: ${privacyUrl}\n` +
      `Al continuar la conversación confirmas que lo leíste.\n\n` +
      `Puedes escribirme o mandarme notas de voz 🎙️. Write *English* to switch language.`,
    videoCaption: ({ vehicle }) => `${vehicle} en 30 segundos 🎬`,
    review: ({ author, vehicle, url }) => `🎥 Mira la reseña de *${author}* sobre la ${vehicle}:\n${url}`,
    creditPrivacy: ({ url }) =>
      `🔒 Para tramitar tu crédito necesitamos datos financieros y patrimoniales, que requieren tu *consentimiento expreso*.\n` +
      `Lee el Aviso de Privacidad para Crédito: ${url}\n\nResponde *ACEPTO* para continuar.`,
    kycLink: ({ url }) =>
      `🪪 Verificación de identidad (2 min): sube tu INE por ambos lados y una selfie aquí:\n${url}\nLa liga vence en 24 h.`,
    signLink: ({ url, bank }) =>
      `✍️ Tu solicitud para *${bank}* está lista. Revísala y fírmala aquí:\n${url}`,
    sentToBank: ({ bank, folio }) =>
      `📨 Enviamos tu solicitud a *${bank}* (folio ${folio}). Te llegó copia a tu correo. Te avisaremos aquí en cuanto el banco responda.`,
    decision: {
      approved: ({ bank, folio }) => `🎉 ¡Buenas noticias! *${bank}* aprobó tu crédito (folio ${folio}). Un asesor te contactará para los siguientes pasos.`,
      rejected: ({ bank, folio }) => `Lamentamos informarte que *${bank}* no aprobó la solicitud (folio ${folio}). Podemos intentar con otra institución si lo deseas.`,
      more_info: ({ bank, folio, notes }) => `*${bank}* requiere información adicional para el folio ${folio}: ${notes}`,
    },
    qrExpired: 'Este código ya expiró. Escanea de nuevo el código que aparece en la pantalla.',
    qrExpiredTitle: 'Código expirado',
    openWhatsapp: 'Abrir WhatsApp',
  },
  en: {
    prefill: ({ vehicle, ref }) => `Hi 👋 I'd like information about the ${vehicle}. (ref: ${ref})`,
    welcome: ({ name, vehicle, dealer, privacyUrl }) =>
      `Hi${name ? ` ${name}` : ''}! I'm ${dealer}'s virtual assistant 🚙\n` +
      `Here's a video of the *${vehicle}*.\n\n` +
      `🔒 Before we continue, please review our Privacy Notice under Mexico's Federal Law on Protection of Personal Data: ${privacyUrl}\n` +
      `By continuing the conversation you confirm you have read it.\n\n` +
      `You can text me or send voice notes 🎙️. Escribe *Español* para cambiar de idioma.`,
    videoCaption: ({ vehicle }) => `The ${vehicle} in 30 seconds 🎬`,
    review: ({ author, vehicle, url }) => `🎥 Watch *${author}*'s review of the ${vehicle} (Spanish):\n${url}`,
    creditPrivacy: ({ url }) =>
      `🔒 To process your financing we need financial and asset information, which requires your *express consent*.\n` +
      `Please read the Credit Privacy Notice: ${url}\n\nReply *I ACCEPT* to continue.`,
    kycLink: ({ url }) =>
      `🪪 Identity check (2 min): upload both sides of your INE/ID and a selfie here:\n${url}\nThe link expires in 24 h.`,
    signLink: ({ url, bank }) => `✍️ Your application for *${bank}* is ready. Review and sign it here:\n${url}`,
    sentToBank: ({ bank, folio }) =>
      `📨 We sent your application to *${bank}* (ref ${folio}). A copy is in your inbox. We'll let you know here as soon as the bank responds.`,
    decision: {
      approved: ({ bank, folio }) => `🎉 Great news! *${bank}* approved your financing (ref ${folio}). An advisor will contact you with next steps.`,
      rejected: ({ bank, folio }) => `We're sorry, *${bank}* did not approve the application (ref ${folio}). We can try another lender if you'd like.`,
      more_info: ({ bank, folio, notes }) => `*${bank}* needs additional information for ref ${folio}: ${notes}`,
    },
    qrExpired: 'This code has expired. Please scan the code on the screen again.',
    qrExpiredTitle: 'Code expired',
    openWhatsapp: 'Open WhatsApp',
  },
};

export const LANGS = ['es', 'en'];
export const normLang = (l) => (LANGS.includes(String(l || '').slice(0, 2).toLowerCase()) ? String(l).slice(0, 2).toLowerCase() : 'es');

export function t(lang, key, vars = {}) {
  const dict = messages[normLang(lang)];
  const v = key.split('.').reduce((o, k) => o?.[k], dict);
  return typeof v === 'function' ? v(vars) : v;
}

// Localiza campos {es, en} de los catálogos.
export const loc = (value, lang) =>
  value && typeof value === 'object' && !Array.isArray(value) ? value[normLang(lang)] ?? value.es : value;

// Detección simple del cambio de idioma pedido por el usuario.
export function detectLangSwitch(text) {
  const s = String(text || '').trim().toLowerCase();
  if (/^(english|ingl[eé]s)$/.test(s)) return 'en';
  if (/^(espa[nñ]ol|spanish)$/.test(s)) return 'es';
  return null;
}
