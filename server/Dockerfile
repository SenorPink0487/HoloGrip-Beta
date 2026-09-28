FROM --platform=$BUILDPLATFORM rust:1.96-slim-bookworm AS build

RUN apt-get update \
    && apt-get install -y --no-install-recommends gcc-x86-64-linux-gnu libc6-dev-amd64-cross \
    && rm -rf /var/lib/apt/lists/* \
    && rustup target add x86_64-unknown-linux-gnu

ENV CARGO_TARGET_X86_64_UNKNOWN_LINUX_GNU_LINKER=x86_64-linux-gnu-gcc \
    CC_x86_64_unknown_linux_gnu=x86_64-linux-gnu-gcc \
    AR_x86_64_unknown_linux_gnu=x86_64-linux-gnu-ar

WORKDIR /build
COPY Cargo.toml Cargo.lock ./
COPY .cargo/ ./.cargo/
COPY migrations/ ./migrations/
COPY src/ ./src/
RUN CARGO_BUILD_JOBS=1 cargo build --release --locked --target x86_64-unknown-linux-gnu

FROM debian:bookworm-slim AS runtime
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --system --uid 10001 --create-home app

WORKDIR /app
COPY --from=build --chown=app:app /build/target/x86_64-unknown-linux-gnu/release/server /usr/local/bin/virtuallab-api
COPY --from=build --chown=app:app /build/migrations ./migrations
USER app
EXPOSE 8080
ENTRYPOINT ["/usr/local/bin/virtuallab-api"]
