# Video de 30 s · Vamo Mesa para el comedor corporativo de Nike (Newrest)

Tres bloques de 10 segundos con voz en off. Cada bloque es un prompt independiente para generadores
de video por clip (Runway Gen-4, Kling, Sora, etc.); se unen en edición. Los prompts visuales van en
inglés porque los generadores responden mejor; la voz en off va en español.

**Referencia de kiosco:** Touch Dynamic Summit (pantalla táctil vertical grande sobre pedestal
inclinado, terminal de pago con NFC y lector de QR a un costado). El diseño del video es una
versión **vanguardista** de ese kiosco para un corporativo deportivo.

**Marca del cliente:** no pidas al generador el logo de Nike (los generadores lo deforman y su uso
requiere aprobación de la marca). Usa el estilo visual de un corporativo deportivo (negro, blanco,
acentos verde neón tipo "volt", tipografía condensada) y coloca el logotipo oficial en edición
sólo si Nike y Newrest lo aprueban.

---

## Ficha técnica (para los tres bloques)

- Formato: 16:9, 1920×1080 (o 4K), 24 fps, 10 s por bloque.
- Estilo: comercial premium de tecnología y deporte, realista, cinematográfico.
- Paleta: negro mate, blanco, concreto pulido, acentos verde neón (#D4FF3A) y luz cálida de comedor.
- Locación: comedor corporativo de un campus de marca deportiva: doble altura, concreto, madera,
  muros LED gigantes, plantas, luz natural de mediodía.
- Kiosco (igual en todos los planos): monolito vertical de 2 m, pantalla táctil portrait de 32",
  cuerpo de aluminio negro con borde de luz verde neón, pedestal inclinado, lector NFC iluminado y
  lector de QR a la altura de la mano. Interfaz con la marca **Vamo Mesa**.
- Personajes: colaboradores diversos de 25 a 45 años con ropa deportiva y de oficina.
- Prompt negativo (si la herramienta lo acepta): `logos, brand marks, swoosh, text artifacts,
  distorted hands, warped screens, cash, paper menus, long blurry faces, low quality`.

---

## Bloque 1 · 0–10 s · Adiós a la fila: pedido desde el celular

**Prompt visual (inglés):**

> Cinematic commercial, 10 seconds. Opening wide shot of a long lunch line in a modern corporate
> cafeteria of a sports brand campus, people checking their watches, slightly desaturated. A fast
> whip-pan transition: the line dissolves into light particles. Cut to a close-up of an employee's
> hand holding a smartphone, thumb tapping a sleek corporate food app branded "Vamo Mesa": weekly
> menu cards (main dish, premium bowl, grab & go salad), a button "Reserve & pay with benefit", a
> confirmation screen with a big 4-character pickup code and a QR code. Match cut to a laptop
> showing the same menu on a corporate web portal. Background: a giant LED video wall displaying a
> dynamic menu with food close-ups. Bold black, white and neon green color grading, shallow depth
> of field, smooth dolly-in, natural midday light, premium tech-and-sport advertising style.

**Voz en off (≈ 9 s):**

> "En el comedor de Nike, la fila ya no existe. Eliges tu comida desde el celular o la web, pagas con tu beneficio… y listo."

**Texto en pantalla:** `Pide desde tu celular o la web` · `Sin filas`

---

## Bloque 2 · 10–20 s · Kiosco vanguardista: cashless, NFC y fila rápida

**Prompt visual (inglés):**

> Cinematic commercial, 10 seconds. Hero shot of an avant-garde self-service kiosk in a corporate
> sports-campus cafeteria: a 2-meter matte black aluminum monolith with a tall portrait touchscreen,
> a thin neon green light edge, an angled pedestal, an illuminated NFC reader and a QR scanner at
> hand height, interface branded "Vamo Mesa". Slow orbit around the kiosk. An employee taps a menu on
> the touchscreen, then pays by tapping a smartwatch on the NFC reader: a neon green ripple of light
> and a "Paid" animation. Another employee scans a QR code from their phone in a "fast lane" and
> walks straight to the counter. Cut to a large pickup display wall showing order codes moving from
> "Preparing" to "Ready" in bright green. Fast, rhythmic editing, polished reflections, shallow
> depth of field, black, white and neon green grade, premium product commercial.

**Voz en off (≈ 9 s):**

> "¿No apartaste? El kiosco te atiende en segundos: pago sin efectivo, con tu tarjeta o tu reloj. Escaneas, recoges y regresas a lo tuyo."

**Texto en pantalla:** `Pago cashless · NFC` · `QR` · `Fila rápida`

---

## Bloque 3 · 20–30 s · Satisfacción, reportes y cierre

**Prompt visual (inglés):**

> Cinematic commercial, 10 seconds. Inside a modern open kitchen: a chef taps orders on a large
> touchscreen order board with three columns (New, Preparing, Ready); no paper tickets. Cut to an
> employee at a table finishing lunch, smiling, receiving an email on their phone "How was your
> meal?" and tapping five glowing stars and the tags "flavor" and "speed". Cut to a facility manager
> in front of a giant curved LED screen showing a live analytics dashboard: meals served, menu
> utilization, waste reduced, average prep time, satisfaction 4.6 out of 5, charts animating upward.
> Final shot: pull back to a wide view of the full cafeteria with no lines, people relaxed, the
> black monolith kiosk glowing neon green; the screen fades to black with clean white space for a
> logo lockup. Black, white and neon green grade, elegant, aspirational, premium tech commercial.

**Voz en off (≈ 10 s):**

> "La cocina ve cada pedido en vivo. Tú calificas tu comida en un toque. Y Newrest mide todo: consumo, tiempos y satisfacción. Vamo Mesa: el comedor que se mueve a tu ritmo."

**Texto en pantalla:** `Satisfacción en un toque` · `Reportes en tiempo real` · cierre: `Vamo Mesa × Newrest`

---

## Audio

- **Voz en off:** español de México, voz masculina o femenina de 30 a 40 años, enérgica y cálida,
  ritmo de comercial deportivo (≈ 2.5 palabras por segundo). Se puede generar con ElevenLabs
  (modelo multilingüe) usando el texto de cada bloque.
- **Música:** electrónica minimalista con pulso deportivo (110 a 120 BPM), sube en el bloque 2 y
  resuelve en el cierre.
- **Efectos:** "tap" del NFC con un destello sonoro corto, clic suave en la pantalla, ambiente de
  comedor que se calma cuando desaparece la fila.

## Edición

1. Generar cada bloque 2 a 4 veces y elegir la toma con el kiosco más consistente.
2. Si la herramienta acepta imagen de referencia, usar una foto del kiosco Summit
   (`ford-im/core/public/mesa/img/summit-pago.png`) como referencia de forma para mantener el
   mismo diseño en los tres bloques.
3. Reemplazar en edición las pantallas generadas por capturas reales de Vamo Mesa (portal, kiosco,
   pase, pantalla de salida e indicadores en `ford-im/core/public/ponencias/newrest-vamo-mesa/img/`)
   para que la interfaz sea la verdadera.
4. Logotipos de Nike y Newrest: sólo en edición y con su aprobación.
