// Notas de voz: transcripción (ElevenLabs Scribe) y respuesta hablada (ElevenLabs TTS),
// convertida a OGG/Opus para que WhatsApp la muestre como nota de voz.
import { spawn } from 'node:child_process';
import { config } from '../config.js';
import { normLang } from '../lib/i18n.js';

const EL = 'https://api.elevenlabs.io/v1';

export async function transcribe(buffer, mime = 'audio/ogg') {
  if (!config.elevenlabs.apiKey) throw Object.assign(new Error('elevenlabs_not_configured'), { status: 503 });
  const form = new FormData();
  form.append('model_id', config.elevenlabs.sttModel);
  form.append('file', new Blob([buffer], { type: mime }), 'audio.ogg');
  const res = await fetch(`${EL}/speech-to-text`, {
    method: 'POST',
    headers: { 'xi-api-key': config.elevenlabs.apiKey },
    body: form,
  });
  const json = await res.json();
  if (!res.ok) throw Object.assign(new Error(`stt_error: ${JSON.stringify(json)}`), { status: 424 });
  return { text: json.text, lang: json.language_code?.startsWith('en') ? 'en' : 'es' };
}

// Las ligas no se pueden "decir": se quitan del audio y se mandan aparte como texto.
export function splitForVoice(text) {
  const links = String(text).match(/https?:\/\/\S+/g) || [];
  const spoken = String(text)
    .replace(/https?:\/\/\S+/g, '')
    .replace(/[*_~`]/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return { spoken, links };
}

export async function synthesize(text, lang = 'es') {
  if (!config.elevenlabs.apiKey) throw Object.assign(new Error('elevenlabs_not_configured'), { status: 503 });
  const voice = config.elevenlabs.voiceId[normLang(lang)] || config.elevenlabs.voiceId.es;
  const res = await fetch(`${EL}/text-to-speech/${voice}?output_format=mp3_44100_128`, {
    method: 'POST',
    headers: { 'xi-api-key': config.elevenlabs.apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, model_id: config.elevenlabs.ttsModel, language_code: normLang(lang) }),
  });
  if (!res.ok) throw Object.assign(new Error(`tts_error: ${await res.text()}`), { status: 424 });
  return mp3ToOggOpus(Buffer.from(await res.arrayBuffer()));
}

export function mp3ToOggOpus(mp3) {
  return new Promise((resolve, reject) => {
    const ff = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', 'pipe:0', '-c:a', 'libopus', '-b:a', '32k', '-ac', '1', '-f', 'ogg', 'pipe:1']);
    const out = [];
    let err = '';
    ff.stdout.on('data', (d) => out.push(d));
    ff.stderr.on('data', (d) => (err += d));
    ff.on('error', reject);
    ff.on('close', (code) => (code === 0 ? resolve(Buffer.concat(out)) : reject(new Error(`ffmpeg ${code}: ${err}`))));
    ff.stdin.end(mp3);
  });
}

// Firma una URL para el agente conversacional de ElevenLabs del kiosco (agente privado).
export async function kioskAgentSignedUrl() {
  const { apiKey, kioskAgentId } = config.elevenlabs;
  if (!apiKey || !kioskAgentId) throw Object.assign(new Error('elevenlabs_agent_not_configured'), { status: 503 });
  const res = await fetch(`${EL}/convai/conversation/get-signed-url?agent_id=${encodeURIComponent(kioskAgentId)}`, {
    headers: { 'xi-api-key': apiKey },
  });
  const json = await res.json().catch(() => ({}));
  // 424 y no 502 en los errores de servicios externos: Cloudflare reemplaza el cuerpo de los 502.
  if (!res.ok) throw Object.assign(new Error(`elevenlabs_error ${res.status}: ${JSON.stringify(json)}`), { status: 424 });
  return json.signed_url;
}
