# Agente de voz del kiosco (ElevenLabs Agents)

El botón **"Habla con nuestro asesor virtual"** del panel táctil abre una conversación de voz en
tiempo real con un agente de ElevenLabs. El backend firma la sesión (`signed URL`), así que el
agente puede ser **privado** y la API key nunca llega al navegador.

## Configuración en ElevenLabs

1. **Agents → Create agent** → "Ford IM – Kiosco".
2. **Security**: activa *Enable authentication* (agente privado). En *Overrides* permite
   **Language** (el kiosco envía `es` o `en` según el botón ES/EN).
3. **Idiomas**: idioma principal Español; agrega English como idioma adicional.
4. **Voz**: una voz multilingüe (la misma que `ELEVENLABS_VOICE_ES` para que suene igual que las
   notas de voz de WhatsApp). Modelo de LLM: Claude (`claude-sonnet-5-5`) si está disponible en tu
   cuenta.
5. **Knowledge base**: sube las fichas técnicas de los 3 modelos y la política de crédito, o
   conecta la URL `https://cotizador.menteia.com/api/v1/vehicles` mediante una herramienta (abajo).
6. Copia el Agent ID en `ELEVENLABS_KIOSK_AGENT_ID`.

## Variables dinámicas que envía el kiosco

`{{vehicle}}`, `{{vehicle_id}}`, `{{lang}}`, `{{dealer}}`, `{{kiosk_id}}`

## Primer mensaje

- ES: `¡Hola! Soy el asesor virtual de {{dealer}}. ¿Qué te gustaría saber del {{vehicle}}? También puedo explicarte cómo funciona el crédito.`
- EN: `Hi! I'm {{dealer}}'s virtual advisor. What would you like to know about the {{vehicle}}? I can also walk you through financing.`

## System prompt

```text
Eres el asesor virtual por voz de {{dealer}}, en un kiosco dentro de la agencia. La persona está
frente a la pantalla viendo el {{vehicle}}. Habla en {{lang}} (es = español de México).

- Respuestas de 1 a 3 frases, conversacionales. Nada de listas ni URLs.
- Temas: características de los modelos Ford exhibidos, versiones, colores, equipamiento,
  promociones vigentes, cómo funciona el crédito automotriz (requisitos generales: INE,
  comprobante de domicilio, comprobantes de ingresos, enganche mínimo típico de 10–20 %, plazos de
  12 a 72 meses), pruebas de manejo.
- Nunca des un precio, tasa o promoción que no venga de la herramienta get_vehicle o de la base de
  conocimiento. Las mensualidades son estimaciones; el banco determina el CAT y la aprobación.
- No pidas datos personales por voz (CURP, ingresos, etc.). Para cotizar o tramitar el crédito,
  invita a escanear el código de la pantalla y continuar por WhatsApp, donde se envían el aviso de
  privacidad, el video y los formularios.
- Si piden un asesor humano, indica que pueden acercarse al módulo de ventas o escribir por
  WhatsApp.
- La conversación se cierra automáticamente a los 5 minutos.
```

## Herramienta opcional (Server tool / webhook)

- **get_vehicle** → `GET https://cotizador.menteia.com/api/v1/vehicles/{vehicle_id}?lang={lang}`
  con cabecera `Authorization: Bearer <N8N_API_KEY>` (guárdala como *secret* en ElevenLabs).
  Parámetros: `vehicle_id` (id del catálogo: territory, maverick, bronco-sport, ranger, transit, edge-hibrida, mustang, mustang-mach-e, bronco, f-150, ranger-raptor, lobo, explorer, super-duty, e-transit, expedition), `lang` (es|en).
