# Monta el volumen de DigitalOcean "fordim-secrets" en /mnt/fordim-secrets (en el host) para que la
# bóveda de /api/admin/secrets sobreviva a los rebuilds del droplet. Lo ejecuta el servicio
# storage-init de docker-compose.demo.yml en cada arranque; es idempotente.
set -eu
DEV=/dev/disk/by-id/scsi-0DO_Volume_fordim-secrets
MNT=/mnt/fordim-secrets
mkdir -p "$MNT"
if [ ! -e "$DEV" ]; then
  MSG="sin volumen $DEV: la bóveda queda en disco local y no sobrevive a un rebuild ($(ls /dev/disk/by-id 2>/dev/null | tr '\n' ' '))"
else
  # Sólo se formatea si el volumen no tiene sistema de archivos (primer uso); nunca uno con datos.
  if [ -z "$(blkid -o value -s TYPE "$DEV" 2>/dev/null)" ]; then mkfs.ext4 -q -L fordimsec "$DEV"; MSG="formateado y montado"; else MSG="montado (ya tenía datos)"; fi
  mountpoint -q "$MNT" || mount -o defaults,discard "$DEV" "$MNT"
fi
echo "[storage-init] $MSG"
echo "$(date -u +%FT%TZ) $MSG" >> "$MNT/.storage-log"
chown 1000:1000 "$MNT"   # usuario node del contenedor core
chmod 700 "$MNT"
