#!/bin/bash
set -e

CODESPACE_APP_URL="https://${CODESPACE_NAME}-80.app.github.dev"
CODESPACE_REVERB_HOST="${CODESPACE_NAME}-8080.app.github.dev"

# ── 1. App URL, session, CORS, and Sanctum ────────────────────────────────────
sed -i "s|APP_URL=.*|APP_URL=${CODESPACE_APP_URL}|" .env
sed -i "s|SESSION_SECURE_COOKIE=.*|SESSION_SECURE_COOKIE=true|" .env
sed -i "s|SESSION_DOMAIN=.*|SESSION_DOMAIN=.app.github.dev|" .env
sed -i "s|SANCTUM_STATEFUL_DOMAINS=.*|SANCTUM_STATEFUL_DOMAINS=${CODESPACE_NAME}-80.app.github.dev|" .env
sed -i "s|CORS_ALLOWED_ORIGINS=.*|CORS_ALLOWED_ORIGINS=${CODESPACE_APP_URL}|" .env

# ── 2. Vite Reverb config (baked into the JS bundle at build time) ────────────
# These vars are read by Vite at build time, not by phpdotenv at runtime.
# We remove any stale VITE_REVERB_* lines (absent from .env.example) and
# append the resolved Codespace values so the JS bundle connects to the right
# public WebSocket endpoint.
REVERB_KEY=$(grep "^REVERB_APP_KEY=" .env | cut -d'=' -f2-)
sed -i '/^VITE_REVERB_/d' .env
cat >> .env << ENVEOF
VITE_REVERB_APP_KEY=${REVERB_KEY}
VITE_REVERB_HOST=${CODESPACE_REVERB_HOST}
VITE_REVERB_PORT=443
VITE_REVERB_SCHEME=https
ENVEOF

# ── 3. Google OAuth ───────────────────────────────────────────────────────────
# Secrets are injected by GitHub Codespaces from repository-level secrets.
# Register https://<CODESPACE_APP_URL>/auth/google/callback in Google Cloud Console.
[ -n "${GOOGLE_CLIENT_ID}" ]     && sed -i "s|GOOGLE_CLIENT_ID=.*|GOOGLE_CLIENT_ID=${GOOGLE_CLIENT_ID}|" .env
[ -n "${GOOGLE_CLIENT_SECRET}" ] && sed -i "s|GOOGLE_CLIENT_SECRET=.*|GOOGLE_CLIENT_SECRET=${GOOGLE_CLIENT_SECRET}|" .env
sed -i "s|GOOGLE_REDIRECT_URI=.*|GOOGLE_REDIRECT_URI=${CODESPACE_APP_URL}/auth/google/callback|" .env

# ── 4. Apple Sign In ──────────────────────────────────────────────────────────
# Register https://<CODESPACE_APP_URL>/auth/apple/callback in Apple Developer Portal.
# APPLE_PRIVATE_KEY must be stored in the GitHub Codespaces secret as a single
# line with literal \n characters (no actual newlines). Example value:
#   -----BEGIN PRIVATE KEY-----\nMIGHAgEA...\n-----END PRIVATE KEY-----
[ -n "${APPLE_CLIENT_ID}" ]     && sed -i "s|APPLE_CLIENT_ID=.*|APPLE_CLIENT_ID=${APPLE_CLIENT_ID}|" .env
[ -n "${APPLE_CLIENT_SECRET}" ] && sed -i "s|APPLE_CLIENT_SECRET=.*|APPLE_CLIENT_SECRET=${APPLE_CLIENT_SECRET}|" .env
[ -n "${APPLE_TEAM_ID}" ]       && sed -i "s|APPLE_TEAM_ID=.*|APPLE_TEAM_ID=${APPLE_TEAM_ID}|" .env
[ -n "${APPLE_KEY_ID}" ]        && sed -i "s|APPLE_KEY_ID=.*|APPLE_KEY_ID=${APPLE_KEY_ID}|" .env
[ -n "${APPLE_PRIVATE_KEY}" ]   && sed -i "s|APPLE_PRIVATE_KEY=.*|APPLE_PRIVATE_KEY=${APPLE_PRIVATE_KEY}|" .env
sed -i "s|APPLE_REDIRECT_URI=.*|APPLE_REDIRECT_URI=${CODESPACE_APP_URL}/auth/apple/callback|" .env

# ── 5. Generate application key ───────────────────────────────────────────────
php artisan key:generate --force

# ── 6. Wait for MySQL to be ready ─────────────────────────────────────────────
DB_USER=$(grep "^DB_USERNAME=" .env | cut -d'=' -f2-)
DB_PASS=$(grep "^DB_PASSWORD=" .env | cut -d'=' -f2-)
echo "Waiting for MySQL..."
until mysqladmin ping -h mysql -u"${DB_USER}" -p"${DB_PASS}" --silent 2>/dev/null; do
    sleep 2
done

# ── 7. Migrate and seed ───────────────────────────────────────────────────────
php artisan migrate --seed --force

# ── 8. Build front-end assets ─────────────────────────────────────────────────
npm ci
npm run build

echo "BurakoBoard is ready → ${CODESPACE_APP_URL}"
