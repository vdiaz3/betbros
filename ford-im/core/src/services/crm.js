// Integración con Twenty CRM (self-hosted en crm.menteia.com) vía su API REST.
// Crea/actualiza la Persona (por teléfono), la Oportunidad (vehículo + etapa) y notas.
// Requiere crear en Twenty los campos personalizados indicados en docs/PENDIENTES.md.
import { config } from '../config.js';
import { getVehicle, getDealer } from '../data/catalog.js';
import { updateSession } from './sessions.js';
import { loc } from '../lib/i18n.js';

const enabled = () => Boolean(config.crm.baseUrl && config.crm.apiKey);

async function rest(method, p, body) {
  const res = await fetch(`${config.crm.baseUrl.replace(/\/$/, '')}/rest/${p}`, {
    method,
    headers: { Authorization: `Bearer ${config.crm.apiKey}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(`crm_error ${res.status}: ${JSON.stringify(json)}`), { status: 424 });
  return json;
}

const first = (json, key) => json?.data?.[key]?.[0] ?? json?.data?.[key] ?? null;

// Etapas del funnel → valores del campo `stage` de Opportunity en Twenty. Los valores son los que
// trae Twenty por defecto; en Settings → Data model → Opportunities → Stage se renombran sus
// etiquetas (ver docs/DEMO-BBVA.md) para que el pipeline del CRM muestre el funnel en español.
export const STAGE_MAP = {
  scanned: 'NEW', chatting: 'NEW',
  test_drive_booked: 'SCREENING',
  credit_consent: 'MEETING', kyc: 'MEETING', credit_collecting: 'MEETING', signing: 'MEETING',
  sent_to_bank: 'PROPOSAL', bank_more_info: 'PROPOSAL', bank_rejected: 'PROPOSAL',
  bank_approved: 'CUSTOMER', closed: 'CUSTOMER',
};

export async function syncSession(session, { note } = {}) {
  if (!enabled()) return { skipped: 'crm_not_configured' };
  const [firstName, ...rest_] = String(session.name || 'Cliente WhatsApp').split(' ');
  const phone = String(session.wa_id || '').replace(/^52(1)?/, '');
  const person = {
    name: { firstName, lastName: rest_.join(' ') },
    phones: { primaryPhoneNumber: phone, primaryPhoneCountryCode: '+52' },
    ...(session.email ? { emails: { primaryEmail: session.email } } : {}),
  };

  let personId = session.crm_person_id;
  if (!personId && phone) {
    const found = await rest('GET', `people?filter=${encodeURIComponent(`phones.primaryPhoneNumber[eq]:"${phone}"`)}&limit=1`);
    personId = first(found, 'people')?.id;
  }
  if (personId) await rest('PATCH', `people/${personId}`, person);
  else personId = first(await rest('POST', 'people', person), 'createPerson')?.id;

  const vehicle = getVehicle(session.vehicle_id);
  const dealer = getDealer(session.dealer_id);
  const opp = {
    name: `${vehicle ? loc(vehicle.name, 'es') : 'Ford'} – ${session.name || session.wa_id} (${session.ref})`,
    stage: STAGE_MAP[session.stage] || 'NEW',
    pointOfContactId: personId,
  };
  let oppId = session.crm_opportunity_id;
  if (oppId) await rest('PATCH', `opportunities/${oppId}`, opp);
  else oppId = first(await rest('POST', 'opportunities', opp), 'createOpportunity')?.id;

  if (note) {
    const created = first(await rest('POST', 'notes', { title: note.title, bodyV2: { markdown: note.body } }), 'createNote');
    if (created?.id && oppId) await rest('POST', 'noteTargets', { noteId: created.id, opportunityId: oppId });
  }

  updateSession(session.id, { crm_person_id: personId, crm_opportunity_id: oppId });
  return { personId, opportunityId: oppId, dealer: dealer?.name };
}
