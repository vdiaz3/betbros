#!/bin/bash
# Ford IM – demo en cotizador.menteia.com (instalación automática con cloud-init)
set -euxo pipefail
mkdir -p /srv/deploylog/__LOG_TOKEN__ && echo ok > /srv/deploylog/index.html
exec > >(tee -a /srv/deploylog/__LOG_TOKEN__/log.txt) 2>&1
# Bitácora de instalación disponible 3 h en :8088/__LOG_TOKEN__/log.txt (luego se apaga)
(cd /srv/deploylog && timeout 10800 python3 -m http.server 8088 >/dev/null 2>&1 &)

export DEBIAN_FRONTEND=noninteractive
fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile && echo '/swapfile none swap sw 0 0' >> /etc/fstab
apt-get update -y && apt-get install -y git ca-certificates curl
curl -fsSL https://get.docker.com | sh

git clone --depth 1 --branch claude/epic-lovelace-kpklve https://github.com/vdiaz3/betbros.git /opt/betbros
echo '__ENV_B64__' | base64 -d > /opt/betbros/ford-im/.env
chmod 600 /opt/betbros/ford-im/.env
cd /opt/betbros/ford-im
docker compose -f docker-compose.demo.yml up -d --build
sleep 15
docker compose -f docker-compose.demo.yml ps
docker compose -f docker-compose.demo.yml logs --tail 40 core
echo "DEPLOY_DONE"
