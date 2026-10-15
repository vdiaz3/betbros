# Pendientes y recomendaciones

## Lo que necesito de ti para conectar todo

| # | Qué | Dónde va |
|---|---|---|
| 1 | URL del n8n y cómo está conectado WhatsApp (Cloud API de Meta, 360dialog, Evolution…), número y token | `.env` (`WA_*`) y credenciales del workflow |
| 2 | Los 3 videos de 30 s (MP4 H.264/AAC, < 16 MB) | URL pública en `core/src/data/vehicles.json` (`video_url`) |
| 3 | Google Sheet de vehículos, precios y promociones, con columna `vehicle_id` (`bronco`, `ranger`, `explorer` o los ids reales) | publicar cada pestaña como CSV y poner las URL en `SHEET_*_CSV` |
| 4 | Modelos reales, fotos (PNG sin fondo, ~1600 px) y precio "desde" | `vehicles.json` + `public/kiosk/assets/vehicles/` |
| 5 | Razón social, domicilio y correo de privacidad del distribuidor | `LEGAL_*` (los avisos son plantillas: debe revisarlos su abogado) |
| 6 | Bancos: correo receptor de solicitudes, tasa de referencia, plazos, enganche mínimo y, si tienen, su PDF de solicitud con campos | `core/src/data/banks.json` (+ `data/forms/`) |
| 7 | Cuenta DocuSign (Integration Key, User ID, Account ID, llave RSA, Connect HMAC) | `DOCUSIGN_*` |
| 8 | SMTP de `menteia.com` (p. ej. credito@menteia.com con SPF/DKIM/DMARC) | `SMTP_URL` |
| 9 | ElevenLabs: API key, voces ES/EN y el agente del kiosco | `ELEVENLABS_*` (ver `agent/elevenlabs-kiosk-agent.md`) |
| 10 | DNS: registros A de `fordim`, `go`, `api`, `kyc`, `firma`, `bancos`, `legal`, `crm` (y `n8n`) de menteia.com hacia el VPS | proveedor DNS |
| 11 | Plantillas de WhatsApp aprobadas por Meta (`ford_im_respuesta_banco`, `ford_im_firma_completa`), para avisar fuera de la ventana de 24 h | Meta Business Manager |
| 12 | Credenciales: ver cómo pasarlas en [DEMO.md](DEMO.md#1-credenciales-cómo-pasármelas) | variables del entorno |
| 13 | Logo oficial en vector (SVG) del kit de marca, si lo hay; hoy se usa el PNG que enviaste | `public/kiosk/assets/ford-logo.png` |

## Configuración de Twenty CRM

1. `docker compose up -d` → entra a `https://crm.menteia.com` y crea el workspace.
2. Settings → APIs → crea una API key → `CRM_API_KEY`.
3. En **Opportunities**, deja las etapas `NEW`, `SCREENING`, `MEETING`, `PROPOSAL` y `CUSTOMER`
   (o ajusta `STAGE_MAP` en `core/src/services/crm.js`).
4. Opcional: agrega a Opportunity los campos `vehiculo`, `kiosco`, `banco` y `folio`.

## Qué más agregaría

**Ventas**
1. ~~Agendar prueba de manejo~~ ✅ hecho: horarios con cupo, confirmación con liga a Google
   Calendar y recordatorio 24 h antes. Siguiente paso: sincronizar con el calendario de cada asesor.
2. **Toma de auto usado (trade-in):** el cliente manda fotos, kilometraje y año, y se calcula un
   avalúo preliminar que se suma como enganche.
3. ~~Bandeja del vendedor~~ ✅ hecho: `vendedor.menteia.com` (o `/crm` en el demo). El vendedor
   toma la conversación, el bot se pausa y responde desde el mismo número.
4. **Seguimiento automático** de leads que no terminaron (24 h, 72 h, 7 días) con plantillas
   aprobadas y sólo con opt-in.
5. **Comparativa entre bancos:** mandar la solicitud a 2 o 3 bancos a la vez y mostrar al cliente
   la mejor oferta.

**Riesgo y cumplimiento**
6. **Revisión humana antes de enviar al banco:** que el F&I apruebe el expediente con un clic.
   Evita rechazos por documentos ilegibles y protege la relación con el banco.
7. **KYC con proveedor certificado** (Truora, MetaMap, Incode o Jumio): validación de la INE contra
   la lista nominal, CURP contra RENAPO y prueba de vida. El modo `webhook` ya está listo.
8. **Retención y borrado automático** de INE y comprobantes (p. ej. a los 90 días si no hay venta),
   cifrado en reposo del volumen y bitácora de accesos.
9. **Derechos ARCO por WhatsApp:** palabras clave BAJA / ACCESO / ELIMINAR, con su flujo y plazos.
10. **Conservación con NOM-151** de las solicitudes firmadas, si el banco lo pide.
11. **Envío por liga segura** (`BANK_DELIVERY_MODE=secure_link`) en lugar de adjuntar INE por correo.

**Operación**
12. **Tablero de métricas** (Metabase en `bi.menteia.com`) sobre `/admin/metrics`: escaneos por
    kiosco y por hora, conversión QR → chat → crédito → firma → aprobación, y modelo más pedido.
13. **Monitoreo de kioscos:** alerta si un kiosco deja de enviar señal (heartbeat) por más de
    5 min, y modo kiosco de Chrome con reinicio automático.
14. **Pruebas A/B** del video y del mensaje de bienvenida por modelo.
15. **Encuesta NPS** al cerrar la conversación y al entregar la unidad.
16. **Respaldos diarios** del volumen `core_data` y de Postgres (Twenty) a otro proveedor.
