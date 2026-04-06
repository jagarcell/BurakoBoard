#!/bin/bash
set -e

# Replace the TLS-terminating Caddyfile with a plain HTTP proxy.
# GitHub Codespaces terminates TLS at the edge; running "tls internal" inside
# the Codespace causes HTTPS→HTTPS redirect loops that conflict with the
# external TLS layer.
cp .devcontainer/Caddyfile.codespaces Caddyfile

# Provide a minimal .env so all containers can start before post-create.sh
# patches the values specific to this Codespace.
cp -n .env.example .env

# Inject host user/group IDs required by compose.yaml build args.
# Docker Compose reads these from .env at build time; without them the
# sail-8.5/app image build fails and the codespace enters recovery mode.
grep -qE "^WWWUSER=" .env || echo "WWWUSER=$(id -u)" >> .env
grep -qE "^WWWGROUP=" .env || echo "WWWGROUP=$(id -g)" >> .env
