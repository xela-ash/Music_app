FROM ubuntu:24.04

RUN apt-get update \
    && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
        ca-certificates \
        curl \
        git \
        postgresql \
        postgresql-contrib \
    && rm -rf /var/lib/apt/lists/*
