# Build environment for Shum's Linux packages (.deb and AppImage).
# Ubuntu 22.04 keeps the packages working on newer distributions.
FROM ubuntu:22.04
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends \
        build-essential ca-certificates curl wget file git pkg-config xz-utils \
        libwebkit2gtk-4.1-dev libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev \
        libdbus-1-dev libfuse2 squashfs-tools \
    && rm -rf /var/lib/apt/lists/*
RUN arch=$(dpkg --print-architecture | sed s/amd64/x64/) \
    && curl -fsSL "https://nodejs.org/dist/v22.12.0/node-v22.12.0-linux-$arch.tar.xz" \
       | tar -xJ -C /usr/local --strip-components=1
RUN curl -fsSL https://sh.rustup.rs | sh -s -- -y --profile minimal --default-toolchain stable
ENV PATH=/root/.cargo/bin:$PATH
