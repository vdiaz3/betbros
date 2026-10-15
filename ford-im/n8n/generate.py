# Regenera ford-im-whatsapp-agent.json a partir de agent/whatsapp-agent-prompt.md:
#   python3 n8n/generate.py
import json, re, uuid, sys, os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# URL base de la API (demo: un solo subdominio). Para el despliegue completo: FORD_IM_API=https://api.menteia.com
API = os.environ.get("FORD_IM_API", "https://cotizador.menteia.com/api")
prompt_md = open(ROOT + '/agent/whatsapp-agent-prompt.md').read()
system = re.search(r"```text\n(.*?)```", prompt_md, re.S).group(1).strip()
system = system.replace("{{ $json.", "{{ $('Inbound').item.json.")
CRED = {"httpHeaderAuth": {"id": "REEMPLAZAR", "name": "Ford IM API (Bearer N8N_API_KEY)"}}
nid = lambda: str(uuid.uuid5(uuid.NAMESPACE_URL, str(len(nodes))))
nodes, conns = [], {}
def node(name, type_, ver, params, pos, creds=None, **extra):
    n = {"parameters": params, "id": nid(), "name": name, "type": type_, "typeVersion": ver, "position": pos}
    if creds: n["credentials"] = creds
    n.update(extra); nodes.append(n); return name
def link(a, b, kind="main", out=0):
    conns.setdefault(a, {}).setdefault(kind, [])
    while len(conns[a][kind]) <= out: conns[a][kind].append([])
    conns[a][kind][out].append({"node": b, "type": kind, "index": 0})

SID = "{{ $('Inbound').item.json.session_id }}"
LANG = "{{ $('Inbound').item.json.lang }}"
CID = "{{ $('Inbound').item.json.context.credit ? $('Inbound').item.json.context.credit.id : $fromAI('credit_id', 'id de la solicitud de crédito (cre_...) devuelto por start_credit', 'string') }}"

node("Verificación Meta (GET)", "n8n-nodes-base.webhook", 2, {"path": "ford-im/whatsapp", "httpMethod": "GET", "responseMode": "responseNode", "options": {}}, [0, 0], webhookId=str(uuid.uuid4()))
node("Responder challenge", "n8n-nodes-base.respondToWebhook", 1.1, {"respondWith": "text", "responseBody": "={{ $json.query['hub.verify_token'] === 'REEMPLAZAR_VERIFY_TOKEN' ? $json.query['hub.challenge'] : 'forbidden' }}", "options": {}}, [220, 0])
link("Verificación Meta (GET)", "Responder challenge")

node("WhatsApp entrante (POST)", "n8n-nodes-base.webhook", 2, {"path": "ford-im/whatsapp", "httpMethod": "POST", "responseMode": "onReceived", "options": {}}, [0, 240], webhookId=str(uuid.uuid4()))
parse = r"""// Normaliza el payload de WhatsApp Cloud API. Ignora acuses de entrega/lectura.
const out = [];
for (const item of $input.all()) {
  const body = item.json.body || item.json;
  for (const entry of body.entry || []) {
    for (const change of entry.changes || []) {
      const v = change.value || {};
      const names = Object.fromEntries((v.contacts || []).map(c => [c.wa_id, c.profile?.name]));
      for (const m of v.messages || []) {
        const media = m.audio || m.voice || m.image || m.document || m.video || null;
        out.push({ json: {
          wa_id: m.from,
          name: names[m.from] || null,
          message_id: m.id,
          type: m.type === 'voice' ? 'audio' : m.type,
          text: m.text?.body || m.button?.text || m.interactive?.button_reply?.title || m.interactive?.list_reply?.title || m.image?.caption || m.document?.caption || '',
          media_id: media?.id || null,
          mime: media?.mime_type || null,
        }});
      }
    }
  }
}
return out;"""
node("Normalizar mensaje", "n8n-nodes-base.code", 2, {"jsCode": parse}, [220, 240])
link("WhatsApp entrante (POST)", "Normalizar mensaje")

node("Inbound", "n8n-nodes-base.httpRequest", 4.2, {
    "method": "POST", "url": f"{API}/v1/inbound", "authentication": "genericCredentialType", "genericAuthType": "httpHeaderAuth",
    "sendBody": True, "specifyBody": "json", "jsonBody": "={{ JSON.stringify($json) }}", "options": {"timeout": 60000}}, [440, 240], CRED)
link("Normalizar mensaje", "Inbound")

node("¿Bot activo?", "n8n-nodes-base.if", 2, {"conditions": {"options": {"caseSensitive": True, "leftValue": "", "typeValidation": "loose"},
    "conditions": [{"id": str(uuid.uuid4()), "leftValue": "={{ $json.bot_paused }}", "rightValue": False, "operator": {"type": "boolean", "operation": "false", "singleValue": True}}], "combinator": "and"}, "options": {}}, [660, 240])
link("Inbound", "¿Bot activo?")

node("Asesor Ford (AI Agent)", "@n8n/n8n-nodes-langchain.agent", 1.7, {
    "promptType": "define",
    "text": "={{ $json.text || ('[El cliente envió un archivo: ' + ($json.media ? $json.media.type : 'desconocido') + ']') }}",
    "options": {"systemMessage": "=" + system, "maxIterations": 12}}, [900, 240])
link("¿Bot activo?", "Asesor Ford (AI Agent)", out=0)

node("Claude", "@n8n/n8n-nodes-langchain.lmChatAnthropic", 1.3, {"model": {"__rl": True, "mode": "id", "value": "claude-sonnet-5-5"}, "options": {"temperature": 0.3, "maxTokensToSample": 1024}}, [700, 520],
     {"anthropicApi": {"id": "REEMPLAZAR", "name": "Anthropic"}})
link("Claude", "Asesor Ford (AI Agent)", "ai_languageModel")
node("Memoria por sesión", "@n8n/n8n-nodes-langchain.memoryBufferWindow", 1.3, {"sessionIdType": "customKey", "sessionKey": "={{ $('Inbound').item.json.session_id }}", "contextWindowLength": 20}, [860, 520])
link("Memoria por sesión", "Asesor Ford (AI Agent)", "ai_memory")

def tool(name, desc, method, path, body=None, x=0):
    p = {"toolDescription": desc, "method": method, "url": f"={API}{path}", "authentication": "genericCredentialType", "genericAuthType": "httpHeaderAuth", "options": {}}
    if body is not None:
        p.update({"sendBody": True, "specifyBody": "json", "jsonBody": "={{ JSON.stringify(" + body + ") }}"})
    node(name, "n8n-nodes-base.httpRequestTool", 4.2, p, [1000 + x * 160, 520], CRED)
    link(name, "Asesor Ford (AI Agent)", "ai_tool")

fa = lambda key, desc, t='string': f"$fromAI('{key}', '{desc}', '{t}')"
tool("get_vehicle", "Especificaciones, precios por versión y promociones vigentes de un vehículo (datos del Google Sheet).", "GET",
     "/v1/vehicles/{{ " + fa('vehicle_id', 'id del vehículo: bronco, ranger o explorer') + " }}?lang=" + LANG, x=0)
tool("list_banks", "Lista de bancos disponibles con plazos permitidos y enganche mínimo.", "GET", "/v1/banks", x=1)
tool("simulate", "Simulación informativa de mensualidad.", "POST", "/v1/simulate",
     "{ bank_id: " + fa('bank_id', 'id del banco') + ", price: " + fa('price', 'precio del vehículo en MXN', 'number') + ", down_payment: " + fa('down_payment', 'enganche en MXN', 'number') + ", term_months: " + fa('term_months', 'plazo en meses', 'number') + " }", x=2)
tool("update_session", "Guarda vehículo de interés (vehicle_id), idioma (lang es|en), nombre o email del cliente.", "PATCH", "/v1/sessions/" + SID,
     fa('patch', 'objeto JSON con vehicle_id, lang, name y/o email', 'json'), x=3)
tool("send_credit_privacy_notice", "Envía el aviso de privacidad para crédito y pide ACEPTO. Usar antes de pedir datos financieros.", "POST", "/v1/sessions/" + SID + "/credit-privacy", "{}", x=4)
tool("start_credit", "Abre la solicitud de crédito con el banco elegido (requiere KYC aprobado). Devuelve id, campos y documentos faltantes.", "POST", "/v1/sessions/" + SID + "/credit",
     "{ bank_id: " + fa('bank_id', 'id del banco elegido') + " }", x=5)
tool("send_kyc_link", "Envía la liga de verificación de identidad (INE o pasaporte + prueba de vida + CURP). Requiere aviso de crédito aceptado.", "POST", "/v1/sessions/" + SID + "/kyc", "{}", x=6)
tool("get_kyc_status", "Estado de la verificación de identidad: pending, approved o rejected.", "GET", "/v1/sessions/" + SID + "/kyc", x=12)
tool("get_test_drive_slots", "Horarios disponibles para prueba de manejo. Opcional: fecha YYYY-MM-DD.", "GET",
     "/v1/sessions/" + SID + "/test-drive/slots?limit=6&date={{ " + fa('date', 'fecha YYYY-MM-DD o vacío para los próximos días') + " }}", x=13)
tool("book_test_drive", "Agenda (o reprograma) la prueba de manejo en el horario elegido.", "POST", "/v1/sessions/" + SID + "/test-drive",
     "{ starts_at: " + fa('starts_at', 'starts_at exacto (número) de la opción elegida', 'number') + " }", x=14)
tool("cancel_test_drive", "Cancela la prueba de manejo agendada.", "DELETE", "/v1/sessions/" + SID + "/test-drive", x=15)
tool("get_credit", "Estado de la solicitud: datos, faltantes, simulación y si está lista.", "GET", "/v1/credit/" + CID, x=7)
tool("update_credit", "Guarda datos de la solicitud. Devuelve errores de validación y faltantes.", "PATCH", "/v1/credit/" + CID,
     "{ fields: " + fa('fields', 'objeto JSON {campo: valor} con las claves de missing_fields', 'json') + " }", x=8)
tool("attach_document", "Adjunta a la solicitud un archivo que el cliente envió por WhatsApp.", "POST", "/v1/credit/" + CID + "/documents",
     "{ kind: " + fa('kind', 'ine_frente, ine_reverso, comprobante_domicilio, comprobante_ingresos o constancia_fiscal') + ", media_id: $('Inbound').item.json.media ? $('Inbound').item.json.media.media_id : " + fa('media_id', 'media_id del archivo') + " }", x=9)
tool("submit_for_signature", "Genera las planillas en PDF y envía la liga de firma DocuSign. Sólo cuando ready=true y el cliente confirmó.", "POST", "/v1/credit/" + CID + "/sign", "{}", x=10)
tool("request_human", "Pausa el bot y avisa a un asesor humano del distribuidor.", "POST", "/v1/sessions/" + SID + "/handoff",
     "{ reason: " + fa('reason', 'motivo breve') + " }", x=11)

node("Responder (texto o voz)", "n8n-nodes-base.httpRequest", 4.2, {
    "method": "POST", "url": f"{API}/v1/reply", "authentication": "genericCredentialType", "genericAuthType": "httpHeaderAuth",
    "sendBody": True, "specifyBody": "json",
    "jsonBody": "={{ JSON.stringify({ session_id: $('Inbound').item.json.session_id, text: $json.output, as_audio: $('Inbound').item.json.reply_as_audio }) }}",
    "options": {"timeout": 60000}}, [1260, 240], CRED)
link("Asesor Ford (AI Agent)", "Responder (texto o voz)")

wf = {"name": "Ford IM – Agente WhatsApp", "nodes": nodes, "connections": conns, "active": False,
      "settings": {"executionOrder": "v1", "saveDataErrorExecution": "all", "saveDataSuccessExecution": "none"},
      "pinData": {}, "meta": {"templateCredsSetupCompleted": False}, "tags": []}
json.dump(wf, open(ROOT + '/n8n/ford-im-whatsapp-agent.json', 'w'), ensure_ascii=False, indent=2)
print(len(nodes), "nodos")
