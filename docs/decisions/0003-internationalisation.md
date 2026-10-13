# 0003 · Internationalisation

Status: accepted (2026-10-13, owner)

## Context

Draftroom's interface is available in English and Spanish, and neither is an afterthought: every visible string, `aria-label`, title, live-region announcement and error message exists in both languages. Documents are written by people, so their content is never translated. The server and the client are separate programs, and a translation that lives in two places drifts.

## Decision

- **Library.** `react-intl` (FormatJS) with ICU messages. Catalogues are `apps/web/src/i18n/en.json` and `es.json`, precompiled at build time. Plurals are ICU plurals, dates and numbers use `Intl`, and a sentence is never built by concatenation.
- **Resolution.** The language is the stored preference, then the browser's language, then English. It is applied before first paint by an inline script in the document head, which also sets `<html lang>`.
- **URLs** and slugs are in English and identical in both languages.
- **The server never returns translated text.** Errors carry a stable `code` and the client maps it to a message. The REST contract's `title` field is an English summary for logs, not for display.
- **Catalogues stay in step.** A `check:messages` script fails when the two catalogues differ in keys or in message arguments. Both are written together in the same change.
- **Pseudo-locale.** A build with an `en-XA` pseudo-locale is used by the end-to-end suite to find strings that were never translated and layouts that overflow.
- **Product content.** Built-in templates are localised product content: the server returns names, descriptions and starting content in the requested language. User documents, comments and names are never translated.
- **Forma UI's strings.** The two internal strings of Forma UI are passed through `FormaProvider` from the same catalogues.
- **Tone.** Interface text is written for the people using the product: no developer-voice copy such as "coming soon", no explanation of where the data comes from.

## Consequences

- Adding a string is a two-file change enforced by a check, which makes a missing translation a build failure instead of a visible bug.
- Because errors are codes, one server release serves both languages and the contract never depends on a translation; the cost is a mapping from every code to a message in the client, which a test can cover.
- Precompiling messages keeps the parser out of the bundle, at the price of a build step.
- The language is known before the first paint, so there is no flash of the wrong language. The inline script has to be allowed by the Content Security Policy, which uses its hash.
- Templates exist in two languages and must be kept in step; they are validated at start-up.

## Alternatives considered

- **i18next:** widely used, but ICU plurals and message arguments need a plugin, and `react-intl` has them built in.
- **Lingui:** also ICU-based; FormatJS was chosen for its extraction and precompilation tooling.
- **Server-side translation of errors:** one place to edit text, but it ties the API to the languages the server knows and makes the contract carry prose.
- **Resolving the language on the server or by URL prefix** (`/es/...`): fine for crawlable sites, unnecessary here, and it would make links differ between languages.
- **Resolving the language after render:** simpler, with a visible flash of English for Spanish speakers.
