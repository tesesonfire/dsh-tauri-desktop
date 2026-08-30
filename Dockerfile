# dsh-tauri-desktop 开发环境（Linux 容器 + WebKitGTK，用于 CI 式构建与集成测试）
FROM rust:1-bookworm AS base

RUN apt-get update && apt-get install -y --no-install-recommends \
    libwebkit2gtk-4.1-dev \
    libgtk-3-dev \
    libayatana-appindicator3-dev \
    librsvg2-dev \
    patchelf \
    curl \
    ca-certificates \
    nodejs \
  && rm -rf /var/lib/apt/lists/*

# pnpm
RUN corepack enable && corepack prepare pnpm@9 --activate

WORKDIR /workspace

# 预取 Rust 依赖（利用 Docker 层缓存）
COPY src-tauri/Cargo.toml src-tauri/build.rs src-tauri/
RUN mkdir -p src-tauri/src && echo "fn main() {}" > src-tauri/src/main.rs \
    && echo "fn main() {}" > src-tauri/src/lib.rs \
    && cd src-tauri && cargo check 2>/dev/null || cargo fetch

FROM base AS test
COPY . .
RUN pnpm install --frozen-lockfile \
    && pnpm build \
    && pnpm test \
    && cd src-tauri && cargo test

FROM base AS build
COPY . .
RUN pnpm install --frozen-lockfile \
    && pnpm plugins:build \
    && pnpm tauri build

CMD ["bash"]
