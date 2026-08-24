#!/usr/bin/env bash
set -euo pipefail

DOMAIN="${DOMAIN:-${1:-}}"
APP_PORT="${APP_PORT:-${2:-}}"
EMAIL="${EMAIL:-${3:-}}"
WEBROOT="/var/www/html"
CERT_PATH="/etc/letsencrypt/live/${DOMAIN}/fullchain.pem"
NGINX_SITE="/etc/nginx/sites-available/${DOMAIN}"
RENEW_DIR="/home/Vietants/cerbot"
RENEW_SCRIPT="${RENEW_DIR}/renew.sh"
RENEW_CRON="0 3 * * * ${RENEW_SCRIPT}"

if [[ -z "$DOMAIN" || -z "$APP_PORT" || -z "$EMAIL" ]]; then
  echo "Usage: DOMAIN=x APP_PORT=3016 EMAIL=a@b.c $0 [DOMAIN APP_PORT EMAIL]"
  exit 1
fi

if ! [[ "$APP_PORT" =~ ^[0-9]+$ ]]; then
  echo "APP_PORT must contain digits only: $APP_PORT"
  exit 1
fi

if [[ $EUID -ne 0 ]]; then
  echo "Must run as root"
  exit 1
fi

case "$DOMAIN" in
  *.demo.ubos.vn) ;;
  *)
    echo "Refusing domain outside *.demo.ubos.vn: $DOMAIN"
    exit 1
    ;;
esac

check_dns() {
  if getent hosts "$DOMAIN" >/dev/null 2>&1; then
    echo "DNS OK: $DOMAIN resolves"
    return 0
  fi

  if command -v nslookup >/dev/null 2>&1; then
    local lookup_output
    lookup_output="$(nslookup "$DOMAIN" 2>&1 || true)"
    if echo "$lookup_output" | grep -qi 'NXDOMAIN'; then
      echo "DNS check failed: NXDOMAIN for $DOMAIN"
      exit 1
    fi
  fi

  echo "DNS check failed: $DOMAIN does not resolve"
  exit 1
}

install_nginx_if_missing() {
  if command -v nginx >/dev/null 2>&1; then
    echo "nginx already installed"
    return 0
  fi

  echo "Installing nginx..."
  apt-get update -y
  apt-get install -y nginx
  systemctl enable nginx
  systemctl start nginx
  echo "nginx installed"
}

install_certbot_if_missing() {
  if command -v certbot >/dev/null 2>&1; then
    echo "certbot already installed"
    return 0
  fi

  echo "Installing certbot..."
  apt-get update -y
  apt-get install -y certbot python3-certbot-nginx
  echo "certbot installed"
}

prepare_webroot() {
  echo "Preparing webroot at $WEBROOT..."
  mkdir -p "$WEBROOT"
  chown -R www-data:www-data "$WEBROOT"
  chmod -R 755 "$WEBROOT"
}

write_http_nginx_config() {
  echo "Writing HTTP nginx config for $DOMAIN..."
  cat > "$NGINX_SITE" <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN};

    root ${WEBROOT};
    index index.html;

    location /.well-known/acme-challenge/ {
        root ${WEBROOT};
        allow all;
    }

    location / {
        try_files \$uri \$uri/ =404;
    }
}
EOF
}

write_full_nginx_config() {
  echo "Writing HTTPS nginx config for $DOMAIN..."
  cat > "$NGINX_SITE" <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN};

    location ^~ /.well-known/acme-challenge/ {
        root ${WEBROOT};
        allow all;
        try_files \$uri =404;
    }

    location / {
        return 301 https://\$host\$request_uri;
    }
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name ${DOMAIN};

    ssl_certificate /etc/letsencrypt/live/${DOMAIN}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/${DOMAIN}/privkey.pem;

    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;

    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;

    client_max_body_size 100M;

    proxy_http_version 1.1;
    proxy_set_header Upgrade \$http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
    proxy_cache_bypass \$http_upgrade;

    proxy_connect_timeout 60s;
    proxy_send_timeout 60s;
    proxy_read_timeout 60s;

    location ^~ /.well-known/acme-challenge/ {
        root /var/www/html;
        allow all;
        try_files \$uri =404;
    }

    location / {
        proxy_pass http://127.0.0.1:${APP_PORT};
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
    }

    error_page 502 503 504 /50x.html;
    location = /50x.html {
        root /usr/share/nginx/html;
    }

    access_log /var/log/nginx/${DOMAIN}.access.log;
    error_log /var/log/nginx/${DOMAIN}.error.log;
}
EOF
}

enable_nginx_site() {
  rm -f "/etc/nginx/sites-enabled/${DOMAIN}"
  ln -sf "$NGINX_SITE" "/etc/nginx/sites-enabled/${DOMAIN}"
}

reload_nginx() {
  echo "Testing nginx configuration..."
  nginx -t
  systemctl reload nginx
  echo "nginx reloaded"
}

obtain_certificate_if_missing() {
  if [[ -f "$CERT_PATH" ]]; then
    echo "Certificate already exists at $CERT_PATH"
    return 0
  fi

  echo "Obtaining certificate for $DOMAIN..."
  certbot certonly --webroot \
    -w "$WEBROOT" \
    -d "$DOMAIN" \
    --non-interactive \
    --agree-tos \
    --email "$EMAIL"

  if [[ ! -f "$CERT_PATH" ]]; then
    echo "Failed to obtain certificate for $DOMAIN"
    exit 1
  fi

  echo "Certificate obtained at $CERT_PATH"
}

ensure_renew_cron() {
  echo "Ensuring certificate renewal cron..."
  mkdir -p "$RENEW_DIR"

  cat > "$RENEW_SCRIPT" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail

LOG_FILE="/var/log/certbot-renew.log"
echo "$(date): Starting certificate renewal" >> "$LOG_FILE"

if certbot renew --quiet --deploy-hook "systemctl reload nginx"; then
  echo "$(date): Renewal successful" >> "$LOG_FILE"
else
  echo "$(date): Renewal failed" >> "$LOG_FILE"
  exit 1
fi
EOF

  chmod +x "$RENEW_SCRIPT"

  local current_crontab=""
  if crontab -l >/dev/null 2>&1; then
    current_crontab="$(crontab -l)"
  fi

  {
    if [[ -n "$current_crontab" ]]; then
      printf '%s\n' "$current_crontab" \
        | grep -v '/home/Vietants/cerbot/renew.sh' \
        | grep -v '^[[:space:]]*$' || true
    fi
    echo "$RENEW_CRON"
  } | crontab -

  echo "Renewal cron configured: $RENEW_CRON"
}

main() {
  echo "=== SSL setup for $DOMAIN (port $APP_PORT) ==="

  check_dns
  install_nginx_if_missing
  install_certbot_if_missing
  prepare_webroot

  if [[ -f "$CERT_PATH" ]]; then
    write_full_nginx_config
    enable_nginx_site
    reload_nginx
  else
    write_http_nginx_config
    enable_nginx_site
    reload_nginx
    obtain_certificate_if_missing
    write_full_nginx_config
    enable_nginx_site
    reload_nginx
  fi

  ensure_renew_cron

  echo "=== SSL setup complete for https://${DOMAIN} ==="
}

main "$@"
