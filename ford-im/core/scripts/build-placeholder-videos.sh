#!/bin/bash
# Genera videos DE MUESTRA (sin material de Ford) para que el demo funcione mientras llegan los
# oficiales. Reemplázalos copiando los MP4 autorizados con el mismo nombre en public/media/videos/.
#   <id>-loop.mp4 : loop horizontal sin audio para el kiosco (8 s, 1280×720)
#   <id>-30s.mp4  : video que se envía por WhatsApp (12 s de muestra)
set -euo pipefail
cd "$(dirname "$0")/../public/media/videos"
FONT=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf
SMALL=/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf
make() { # id "Nombre" color1 color2
  local id=$1 name=$2 c1=$3 c2=$4
  for kind in loop 30s; do
    local dur=8; [ "$kind" = 30s ] && dur=12
    ffmpeg -hide_banner -loglevel error -y \
      -f lavfi -i "gradients=s=1280x720:c0=${c1}:c1=${c2}:x0=0:y0=0:x1=1280:y1=720:nb_colors=2:speed=0.012:d=${dur}:r=30" \
      -vf "drawbox=x='mod(t*220,1700)-400':y=0:w=160:h=720:color=white@0.06:t=fill,\
drawtext=fontfile=${FONT}:text='${name}':fontcolor=white:fontsize=96:x=(w-text_w)/2:y=(h-text_h)/2-20:alpha='min(1,t/1.2)',\
drawtext=fontfile=${SMALL}:text='VIDEO DE MUESTRA · reemplazar por material oficial':fontcolor=white@0.7:fontsize=24:x=(w-text_w)/2:y=h-70" \
      -t $dur -an -c:v libx264 -preset slow -crf 30 -pix_fmt yuv420p -movflags +faststart "${id}-${kind}.mp4"
  done
  # Versión WebM del loop (navegadores sin H.264, p. ej. Chromium)
  ffmpeg -hide_banner -loglevel error -y -i "${id}-loop.mp4" -an -c:v libvpx-vp9 -b:v 0 -crf 40 -row-mt 1 "${id}-loop.webm"
}
make bronco   "Ford Bronco"   0x1f4e8c 0x0a1f45
make ranger   "Ford Ranger"   0x2c5f2d 0x0d2410
make explorer "Ford Explorer" 0x6b3e26 0x2a170c
ls -la *.mp4 *.webm
