// Adaptador WhatsApp Cloud API (Meta). Si el número está conectado por otro proveedor
// (360dialog, Evolution API, Twilio…), sólo hay que reimplementar estas funciones.
import { config } from '../config.js';

const graph = (p) => `https://graph.facebook.com/${config.whatsapp.graphVersion}/${p}`;
const enabled = () => Boolean(config.whatsapp.token && config.whatsapp.phoneNumberId);

async function call(body) {
  if (!enabled()) {
    console.log('[whatsapp:dry-run]', JSON.stringify(body));
    return { dryRun: true };
  }
  const res = await fetch(graph(`${config.whatsapp.phoneNumberId}/messages`), {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.whatsapp.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', ...body }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(`whatsapp_error: ${JSON.stringify(json.error || json)}`), { status: 502 });
  return json;
}

export const sendText = (to, text) => call({ to, type: 'text', text: { body: text, preview_url: true } });
export const sendVideo = (to, link, caption) => call({ to, type: 'video', video: { link, caption } });
export const sendAudioId = (to, id) => call({ to, type: 'audio', audio: { id } });
export const sendDocument = (to, link, filename, caption) => call({ to, type: 'document', document: { link, filename, caption } });

// Plantillas aprobadas: obligatorias para escribir fuera de la ventana de 24 h
// (p. ej. cuando el banco responde días después).
export const sendTemplate = (to, name, lang, params = []) =>
  call({
    to,
    type: 'template',
    template: {
      name,
      language: { code: config.whatsapp.templateLang[lang] || lang },
      components: params.length ? [{ type: 'body', parameters: params.map((p) => ({ type: 'text', text: String(p) })) }] : [],
    },
  });

export async function uploadMedia(buffer, mime, filename) {
  if (!enabled()) return { id: 'dry-run-media' };
  const form = new FormData();
  form.append('messaging_product', 'whatsapp');
  form.append('type', mime);
  form.append('file', new Blob([buffer], { type: mime }), filename);
  const res = await fetch(graph(`${config.whatsapp.phoneNumberId}/media`), {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.whatsapp.token}` },
    body: form,
  });
  const json = await res.json();
  if (!res.ok) throw Object.assign(new Error(`whatsapp_upload_error: ${JSON.stringify(json.error || json)}`), { status: 502 });
  return json;
}

// Descarga un medio recibido (nota de voz, foto de INE, PDF) a partir de su media id.
export async function downloadMedia(mediaId) {
  if (!enabled()) throw Object.assign(new Error('whatsapp_not_configured'), { status: 503 });
  const auth = { Authorization: `Bearer ${config.whatsapp.token}` };
  const meta = await (await fetch(graph(mediaId), { headers: auth })).json();
  if (!meta.url) throw Object.assign(new Error('media_not_found'), { status: 404 });
  const res = await fetch(meta.url, { headers: auth });
  if (!res.ok) throw Object.assign(new Error(`media_download_${res.status}`), { status: 502 });
  return { buffer: Buffer.from(await res.arrayBuffer()), mime: meta.mime_type, size: meta.file_size };
}
