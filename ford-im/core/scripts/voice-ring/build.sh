#!/bin/sh
# Genera public/kiosk/vendor/voice-ring.js: voice-ring + React en un solo módulo ES, servido por
# el propio cotizador (sin CDN en tiempo de ejecución). Versiones fijas; voice-ring 0.1.2 se revisó
# antes de incluirlo (sin llamadas de red, eval ni almacenamiento). Para actualizar, revisa el
# código de la nueva versión, cambia las versiones aquí y vuelve a correr:
#   sh scripts/voice-ring/build.sh
set -eu
HERE=$(cd "$(dirname "$0")" && pwd)
OUT="$HERE/../../public/kiosk/vendor/voice-ring.js"
TMP=$(mktemp -d)
cp "$HERE/entry.js" "$TMP/"
cd "$TMP"
npm init -y >/dev/null
npm i -s --no-audit --no-fund react@18.3.1 react-dom@18.3.1 voice-ring@0.1.2 esbuild@0.24.2
npx esbuild entry.js --bundle --format=esm --minify --target=es2020 --legal-comments=eof \
  --define:process.env.NODE_ENV='"production"' \
  --banner:js='/* voice-ring 0.1.2 (MIT, Jakub Antalik) + React 18.3.1 (MIT, Meta). Generado por scripts/voice-ring/build.sh */' \
  --outfile="$OUT"
rm -rf "$TMP"
echo "OK $OUT"
