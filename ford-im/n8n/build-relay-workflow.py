# Genera el flujo "Ford IM – Agente WhatsApp" para un número cuya conexión ya vive en n8n
# (sin token de Meta en el cotizador). Parte de ford-im-whatsapp-agent.json y:
#   · recibe en el webhook que Meta ya llama (/webhook/venemex), respondiendo de inmediato;
#   · usa el modelo y la credencial de OpenAI indicados;
#   · pone la llave del cotizador directo en los nodos HTTP (sin credencial que asignar);
#   · agrega el disparador /webhook/ford-im/send: el cotizador manda ahí sus mensajes y n8n los
#     envía con su nodo de WhatsApp (texto, video, documento).
#
#   python3 n8n/build-relay-workflow.py              → plantilla sin llave (se sube a git)
#   FORD_IM_API_KEY=... python3 n8n/build-relay-workflow.py --local → lista para importar (NO subir)
import json, os, sys, uuid, copy

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LOCAL = '--local' in sys.argv
KEY = os.environ.get('FORD_IM_API_KEY', '') if LOCAL else '__FORD_IM_API_KEY__'
if LOCAL and not KEY:
    sys.exit('Falta FORD_IM_API_KEY (es N8N_API_KEY del .env del cotizador)')

INBOUND_PATH = 'venemex'
PHONE_NUMBER_ID = '510249725505334'                       # +52 1 720 134 6482
WA_CRED = {'whatsAppApi': {'id': 'y6BgcT0A2Y2IDotW', 'name': 'WhatsApp VENEMEX'}}
OPENAI_CRED = {'openAiApi': {'id': 'ai1TJrAMpipluBap', 'name': 'OpenAi savant'}}
OPENAI_MODEL = 'gpt-4.1-mini'

wf = json.load(open(f'{ROOT}/n8n/ford-im-whatsapp-agent.json'))
nodes, conns = [], copy.deepcopy(wf['connections'])

def with_key(node):
    p = node['parameters']
    p.pop('genericAuthType', None)
    p['authentication'] = 'none'
    p['sendHeaders'] = True
    p['headerParameters'] = {'parameters': [{'name': 'Authorization', 'value': f'Bearer {KEY}'}]}
    node.pop('credentials', None)
    return node

for n in wf['nodes']:
    if n['name'] in ('Verificación Meta (GET)', 'Responder challenge'):
        conns.pop(n['name'], None)
        continue  # Meta ya tiene verificada la URL /webhook/venemex
    if n['name'] == 'WhatsApp entrante (POST)':
        n['parameters'].update({'path': INBOUND_PATH, 'responseMode': 'onReceived'})
    if n['name'] == 'Claude':
        conns['OpenAI Chat Model'] = conns.pop('Claude')
        n = {'parameters': {'model': {'__rl': True, 'mode': 'list', 'value': OPENAI_MODEL}, 'options': {'temperature': 0.3}},
             'id': n['id'], 'name': 'OpenAI Chat Model', 'type': '@n8n/n8n-nodes-langchain.lmChatOpenAi',
             'typeVersion': 1.3, 'position': n['position'], 'credentials': OPENAI_CRED}
    if (n.get('credentials') or {}).get('httpHeaderAuth'):
        with_key(n)
    nodes.append(n)

# --- Relevo de envío: cotizador → n8n → WhatsApp -----------------------------------------
nid = lambda s: str(uuid.uuid5(uuid.NAMESPACE_URL, 'ford-im-relay-' + s))
X, Y = 0, 760
def node(name, type_, ver, params, pos, creds=None, **extra):
    n = {'parameters': params, 'id': nid(name), 'name': name, 'type': type_, 'typeVersion': ver, 'position': pos}
    if creds: n['credentials'] = creds
    n.update(extra); nodes.append(n)
def link(a, b, out=0):
    conns.setdefault(a, {}).setdefault('main', [])
    while len(conns[a]['main']) <= out: conns[a]['main'].append([])
    conns[a]['main'][out].append({'node': b, 'type': 'main', 'index': 0})

node('Envío desde cotizador', 'n8n-nodes-base.webhook', 2,
     {'path': 'ford-im/send', 'httpMethod': 'POST', 'responseMode': 'lastNode', 'options': {}}, [X, Y],
     webhookId=nid('send-webhook'))
node('¿Llave del cotizador?', 'n8n-nodes-base.if', 2, {'conditions': {
    'options': {'caseSensitive': True, 'leftValue': '', 'typeValidation': 'strict'},
    'conditions': [{'id': nid('cond-key'), 'leftValue': '={{ $json.headers.authorization }}', 'rightValue': f'Bearer {KEY}',
                    'operator': {'type': 'string', 'operation': 'equals'}}], 'combinator': 'and'}, 'options': {}}, [X + 220, Y])
link('Envío desde cotizador', '¿Llave del cotizador?')

rule = lambda t: {'conditions': {'options': {'caseSensitive': True, 'leftValue': '', 'typeValidation': 'strict'},
    'conditions': [{'id': nid('rule-' + t), 'leftValue': '={{ $json.body.type }}', 'rightValue': t,
                    'operator': {'type': 'string', 'operation': 'equals'}}], 'combinator': 'and'}, 'renameOutput': True, 'outputKey': t}
node('Tipo de mensaje', 'n8n-nodes-base.switch', 3, {'rules': {'values': [rule('text'), rule('video'), rule('document')]}, 'options': {}}, [X + 440, Y])
link('¿Llave del cotizador?', 'Tipo de mensaje', 0)

base = {'resource': 'message', 'operation': 'send', 'phoneNumberId': PHONE_NUMBER_ID, 'recipientPhoneNumber': '={{ $json.body.to }}'}
node('WhatsApp · texto', 'n8n-nodes-base.whatsApp', 1,
     {**base, 'messageType': 'text', 'textBody': '={{ $json.body.text.body }}', 'additionalFields': {'previewUrl': True}}, [X + 700, Y - 160], WA_CRED)
node('WhatsApp · video', 'n8n-nodes-base.whatsApp', 1,
     {**base, 'messageType': 'video', 'mediaPath': 'useMediaLink', 'mediaLink': '={{ $json.body.video.link }}',
      'additionalFields': {'mediaCaption': '={{ $json.body.video.caption || "" }}'}}, [X + 700, Y], WA_CRED)
node('WhatsApp · documento', 'n8n-nodes-base.whatsApp', 1,
     {**base, 'messageType': 'document', 'mediaPath': 'useMediaLink', 'mediaLink': '={{ $json.body.document.link }}',
      'additionalFields': {'mediaFilename': '={{ $json.body.document.filename || "documento.pdf" }}',
                           'mediaCaption': '={{ $json.body.document.caption || "" }}'}}, [X + 700, Y + 160], WA_CRED)
link('Tipo de mensaje', 'WhatsApp · texto', 0)
link('Tipo de mensaje', 'WhatsApp · video', 1)
link('Tipo de mensaje', 'WhatsApp · documento', 2)

wf.update({'name': 'Ford IM – Agente WhatsApp', 'nodes': nodes, 'connections': conns})
out = f'{ROOT}/n8n/ford-im-whatsapp-agent.relay' + ('.local.json' if LOCAL else '.json')
json.dump(wf, open(out, 'w'), ensure_ascii=False, indent=2)
print('OK', out, '·', len(nodes), 'nodos')
