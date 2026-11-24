# Vamo Mesa · Voz en off del video (37 s) para ElevenLabs

Ritmo: ≈ 2.5 palabras por segundo (comercial, español de México). Los silencios entre bloques
(1–2 s, 21–22 s y 32–33 s) dejan respirar la música y el efecto de cada escena.

## Guion con tiempos

| Tiempo | Escena | Voz en off | Palabras |
|---|---|---|---|
| 0–1 s | Fila larga en el comedor | [sighs] ¿Otra vez la fila? | 4 |
| 1–2 s | (silencio: la fila se disuelve) | — | — |
| 2–4 s | Elige su menú en el celular y se genera su código | [excited] Hoy eliges desde tu celular… | 5 |
| 4–7 s | Pide desde su desktop con su cuenta de trabajo; escanea el QR y pasa directo a recoger | …o desde tu computadora del trabajo. Escaneas y pasas directo. | 9 |
| 7–21 s | En el kiosco elige, paga escaneando su gafete o su tarjeta y pasa a recoger: el restaurante ya sabía que venía, qué quería y cómo lo quería | [warm] ¿Prefieres el kiosco? Eliges ahí mismo, pagas con tu gafete o tu tarjeta… y pasas a recoger. [softly] Porque la cocina ya sabía que venías, qué querías… [smiling] y cómo lo querías. | 34 |
| 21–22 s | (silencio) | — | — |
| 22–25 s | La cocina controla todas las órdenes y cambia el estado con un toque | [confident] En cocina, cada orden cambia de estado con un toque. | 10 |
| 25–28 s | Cada persona responde su encuesta de satisfacción | [curious] ¿Qué tal estuvo? Tu opinión llega en segundos. | 8 |
| 28–32 s | Las métricas se registran en el dashboard de gestión y calidad para mejorar siempre | [confident] Todo se mide en un tablero de calidad… para mejorar cada día. | 12 |
| 32–33 s | (silencio) | — | — |
| 33–37 s | Cierre con la marca | [warm] Menos fila. Más comida… [excited] Vamo Mesa. | 7 |

## Para pegar en ElevenLabs v3 (con etiquetas de emoción)

Pega cada bloque por separado (así controlas el tiempo y puedes regenerar sólo el que no quede):

**Bloque 1 · 0–1 s**
```
[sighs] ¿Otra vez la fila?
```

**Bloque 2 · 2–7 s**
```
[excited] Hoy eliges desde tu celular… o desde tu computadora del trabajo. Escaneas y pasas directo.
```

**Bloque 3 · 7–21 s**
```
[warm] ¿Prefieres el kiosco? Eliges ahí mismo, pagas con tu gafete o tu tarjeta… y pasas a recoger. [softly] Porque la cocina ya sabía que venías, qué querías… [smiling] y cómo lo querías.
```

**Bloque 4 · 22–25 s**
```
[confident] En cocina, cada orden cambia de estado con un toque.
```

**Bloque 5 · 25–28 s**
```
[curious] ¿Qué tal estuvo? Tu opinión llega en segundos.
```

**Bloque 6 · 28–32 s**
```
[confident] Todo se mide en un tablero de calidad… para mejorar cada día.
```

**Bloque 7 · 33–37 s**
```
[warm] Menos fila. Más comida… [excited] Vamo Mesa.
```

**Todo junto (una sola generación):**
```
[sighs] ¿Otra vez la fila?

[excited] Hoy eliges desde tu celular… o desde tu computadora del trabajo. Escaneas y pasas directo.

[warm] ¿Prefieres el kiosco? Eliges ahí mismo, pagas con tu gafete o tu tarjeta… y pasas a recoger. [softly] Porque la cocina ya sabía que venías, qué querías… [smiling] y cómo lo querías.

[confident] En cocina, cada orden cambia de estado con un toque.

[curious] ¿Qué tal estuvo? Tu opinión llega en segundos.

[confident] Todo se mide en un tablero de calidad… para mejorar cada día.

[warm] Menos fila. Más comida… [excited] Vamo Mesa.
```

## Variante para Multilingual v2 (sin etiquetas de emoción, con pausas exactas)

```
¿Otra vez la fila? <break time="1.0s" />
Hoy eliges desde tu celular… o desde tu computadora del trabajo. Escaneas y pasas directo. <break time="0.6s" />
¿Prefieres el kiosco? Eliges ahí mismo, pagas con tu gafete o tu tarjeta… y pasas a recoger. <break time="0.5s" /> Porque la cocina ya sabía que venías, qué querías… y cómo lo querías. <break time="1.0s" />
En cocina, cada orden cambia de estado con un toque. <break time="0.4s" />
¿Qué tal estuvo? Tu opinión llega en segundos. <break time="0.4s" />
Todo se mide en un tablero de calidad… para mejorar cada día. <break time="1.0s" />
Menos fila. Más comida… Vamo Mesa.
```

## Ajustes recomendados

- **Modelo:** Eleven v3 para las emociones; Multilingual v2 si prefieres pausas exactas.
- **Voz:** español de México, 30 a 40 años, cálida y enérgica (ej.: una voz de "narrador comercial"
  de la biblioteca o tu voz clonada). La misma voz en todos los bloques.
- **v3:** estabilidad en "Natural" (o "Creative" si quieres más emoción en el cierre).
- **v2:** estabilidad ≈ 45 %, similitud ≈ 75 %, estilo ≈ 30 %, speaker boost activado.
- **Pronunciación:** si dice "Vamo" raro, escribe "Vámo Mesa" sólo en el texto que pegas (en
  pantalla sigue "Vamo Mesa").
- **Ajuste fino de tiempo:** si un bloque queda largo, sube la velocidad a 1.05–1.1 en ese bloque
  o recorta: en el bloque 3, "ahí mismo" y "qué querías" son los cortes más naturales.
