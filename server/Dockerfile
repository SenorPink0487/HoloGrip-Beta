FROM rust:1.96-slim-bookworm AS build

WORKDIR /build
COPY Cargo.toml Cargo.lock ./
COPY .cargo/ ./.cargo/
COPY migrations/ ./migrations/
COPY src/ ./src/
RUN CARGO_BUILD_JOBS=1 cargo build --release --locked

FROM debian:bookworm-slim AS runtime
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --system --uid 10001 --create-home app

WORKDIR /app
COPY --from=build --chown=app:app /build/target/release/server /usr/local/bin/virtuallab-api
COPY --from=build --chown=app:app /build/migrations ./migrations
USER app
EXPOSE 8080
ENTRYPOINT ["/usr/local/bin/virtuallab-api"]
