FROM ubuntu:24.04

# Ubuntu 24.04 stays so .cursor/lib/postgres.sh can keep using PostgreSQL 16.
# Node.js 22.14.0 is not in the Ubuntu archive at this patch, so the official
# linux-x64 tarball is checksum-pinned. That tarball includes npm and corepack
# 0.31.0. pnpm 12 no longer ships bin/pnpm.cjs, which 0.31.0 tries to launch.
# corepack 0.34.7 is the newest release whose engines accept Node 22.14.0 and
# that can activate pnpm 12.5.1. corepack 0.35+ requires Node >= 22.22.2.
ENV NODE_VERSION=22.14.0 \
    NODE_SHA256=9d942932535988091034dc94cc5f42b6dc8784d6366df3a36c4c9ccb3996f0c2 \
    COREPACK_VERSION=0.34.7 \
    PNPM_VERSION=12.5.1 \
    COREPACK_HOME=/usr/local/share/corepack \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0

RUN apt-get update \
    && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
        ca-certificates \
        curl \
        git \
        postgresql \
        postgresql-contrib \
        sudo \
    && rm -rf /var/lib/apt/lists/* \
    && echo 'ubuntu ALL=(ALL) NOPASSWD:ALL' > /etc/sudoers.d/90-ubuntu-nopasswd \
    && chmod 440 /etc/sudoers.d/90-ubuntu-nopasswd \
    && visudo -cf /etc/sudoers.d/90-ubuntu-nopasswd

RUN set -eu \
    && dpkg --print-architecture | grep -qx amd64 \
    && tarball="node-v${NODE_VERSION}-linux-x64.tar.gz" \
    && curl -fsSL "https://nodejs.org/dist/v${NODE_VERSION}/${tarball}" -o "/tmp/${tarball}" \
    && echo "${NODE_SHA256}  /tmp/${tarball}" | sha256sum -c - \
    && tar -xzf "/tmp/${tarball}" -C /usr/local --strip-components=1 \
    && rm -f "/tmp/${tarball}" \
    && npm install -g "corepack@${COREPACK_VERSION}" \
    && corepack enable \
    && mkdir -p "${COREPACK_HOME}" \
    && corepack prepare "pnpm@${PNPM_VERSION}" --activate \
    && chmod -R a+rX "${COREPACK_HOME}" \
    && node --version | grep -qx "v${NODE_VERSION}" \
    && corepack --version | grep -qx "${COREPACK_VERSION}" \
    && pnpm --version | grep -qx "${PNPM_VERSION}" \
    && runuser -u ubuntu -- env \
        COREPACK_HOME="${COREPACK_HOME}" \
        COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
        node --version \
    && runuser -u ubuntu -- env \
        COREPACK_HOME="${COREPACK_HOME}" \
        COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
        npm --version \
    && runuser -u ubuntu -- env \
        COREPACK_HOME="${COREPACK_HOME}" \
        COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
        pnpm --version \
    && runuser -u ubuntu -- env \
        COREPACK_HOME="${COREPACK_HOME}" \
        COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
        corepack enable \
    && runuser -u ubuntu -- sudo -n true
