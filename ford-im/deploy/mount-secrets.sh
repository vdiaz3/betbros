# Monta el volumen de DigitalOcean "fordim-secrets" en /mnt/fordim-secrets (en el host) para que la
# bóveda de /api/admin/secrets sobreviva a los rebuilds del droplet. Lo ejecuta el servicio
# storage-init de docker-compose.demo.yml en cada arranque; es idempotente.
set -eu
DEV=/dev/disk/by-id/scsi-0DO_Volume_fordim-secrets
MNT=/mnt/fordim-secrets
mkdir -p "$MNT"
if [ ! -e "$DEV" ]; then
  echo "[storage-init] sin volumen $DEV: la bóveda queda en disco local y no sobrevive a un rebuild"
else
  # Sólo se formatea si el volumen está vacío (primer uso); nunca se toca uno con datos.
  blkid "$DEV" >/dev/null 2>&1 || mkfs.ext4 -q -L fordimsec "$DEV"
  mountpoint -q "$MNT" || mount -o defaults,discard "$DEV" "$MNT"
  echo "[storage-init] volumen montado en $MNT"
fi
chown 1000:1000 "$MNT"   # usuario node del contenedor core
chmod 700 "$MNT"
