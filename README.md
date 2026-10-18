# Draftroom

A collaborative document editor: a document explorer, a shared editor with live presence, anchored comments, sharing by role and version history. Desktop-first (from 1280 px), in English and Spanish, with light and dark themes.

Planned stack: React, TypeScript and Vite with Tiptap and Yjs on the client; a Node.js server with Hocuspocus for real-time collaboration and PostgreSQL for metadata and the binary Yjs state. Shared components and design tokens come from [Forma UI](https://github.com/Yelison/forma-ui).

The static demo needs no server: its collaboration, including the second person who writes and the tabs that share a document, is simulated in the browser.

The project is at its planning stage. Everything lands through pull requests; see [CONTRIBUTING](CONTRIBUTING.md).

## Known limitations

- **Email addresses are not verified at sign-up.** Whoever signs up first with an address that has a pending invitation inherits what was shared with it, and the sign-up answer tells which addresses have an account. Closing it needs a verification link and email delivery in both languages; see [ADR 0004](docs/decisions/0004-authentication.md#known-risk-no-email-verification).

## Run it yourself

You need Docker with the Compose plugin and a host name that points at the machine (or `draftroom.localhost` to try it on one machine).

```sh
cp deploy/env.example deploy/.env       # then fill in the host name and the two secrets (empty until you do)
docker compose --env-file deploy/.env -f deploy/docker-compose.prod.yml -p draftroom up -d --build --wait
```

Caddy serves the app over HTTPS, the server migrates the database when it starts, and only the proxy publishes ports. Take a backup
with `scripts/backup.sh` and restore it with `scripts/restore.sh`. [The deployment guide](docs/deploy/README.md) covers running without
Docker, the reverse proxy and its WebSocket requirements, every variable, backups, and why a document is served by one process.

## License

[MIT](LICENSE)
