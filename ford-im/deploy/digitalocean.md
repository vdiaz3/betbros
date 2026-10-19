# Despliegue del demo en DigitalOcean

Droplet actual: **ford-im-cotizador** · Ubuntu 24.04 · 1 vCPU / 2 GB (+2 GB swap) · nyc1 · IP `165.227.203.0`
(etiquetas `ford-im`, `demo`). Se instaló solo con cloud-init (`user-data.sh.tpl`): Docker,
clon de la rama `claude/epic-lovelace-kpklve` en `/opt/betbros` y
`docker compose -f docker-compose.demo.yml up -d --build`.

DNS (Cloudflare): `A  cotizador  165.227.203.0`, **DNS only** (nube gris) hasta que el sitio
abra con HTTPS; después se puede activar el proxy con SSL/TLS en *Full (strict)*.

## Actualizar a la última versión

```bash
ssh root@165.227.203.0          # la contraseña de root llegó al correo de la cuenta de DigitalOcean
cd /opt/betbros && git pull
cd ford-im && docker compose -f docker-compose.demo.yml up -d --build
```

## Cambiar credenciales

Edita `/opt/betbros/ford-im/.env` (o regenéralo con `core/scripts/write-env.mjs`) y reinicia:
`docker compose -f docker-compose.demo.yml up -d`.

## Volver a crear el droplet

`user-data.sh.tpl` es la plantilla. Reemplaza `__ENV_B64__` por `base64 -w0 ford-im/.env` y
`__LOG_TOKEN__` por un valor aleatorio, y pásala como *User data* al crear el droplet.
