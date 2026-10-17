# Draftroom

A collaborative document editor: a document explorer, a shared editor with live presence, anchored comments, sharing by role and version history. Desktop-first (from 1280 px), in English and Spanish, with light and dark themes.

Planned stack: React, TypeScript and Vite with Tiptap and Yjs on the client; a Node.js server with Hocuspocus for real-time collaboration and PostgreSQL for metadata and the binary Yjs state. Shared components and design tokens come from [Forma UI](https://github.com/Yelison/forma-ui).

The static demo needs no server: its collaboration, including the second person who writes and the tabs that share a document, is simulated in the browser.

The project is at its planning stage. Everything lands through pull requests; see [CONTRIBUTING](CONTRIBUTING.md).

## Known limitations

- **Email addresses are not verified at sign-up.** Whoever signs up first with an address that has a pending invitation inherits what was shared with it, and the sign-up answer tells which addresses have an account. Closing it needs a verification link and email delivery in both languages; see [ADR 0004](docs/decisions/0004-authentication.md#known-risk-no-email-verification).

## License

[MIT](LICENSE)
