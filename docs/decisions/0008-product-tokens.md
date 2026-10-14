# 0008 · Product tokens in a generated file

Status: accepted (2026-10-13, owner)

## Context

Forma UI's tokens cover colour, typography, spacing, radius, control sizes, motion and z-index (ADR 0002). Draftroom also needs values no generic library would carry: the measures of its layouts (rails, headers, toolbar, footer, sheet, side panel, preview), the typography of the document being edited, and the colour of the selected navigation item. Until now only the four layout widths existed, written by hand in `layout-tokens.css`.

These values are maintained in a token source that is kept outside this repository. Where a product value used to differ from a Forma UI token, Forma UI's value was adopted (plan decisions D9 and D10), and text that would have used the brand colour uses `blue-ink`.

## Decision

- **A generated file is committed.** `apps/web/src/styles/draftroom-tokens.css` is produced from the external token source by its generator and copied into the repository unchanged. Its header says that it is generated and by what. It replaces `layout-tokens.css`, and loads in the same place: after Forma UI's tokens and before the app's own styles.
- **It is never edited by hand.** A change to a product token is made in the source, regenerated and committed as a new copy, so the diff of the pull request is the diff of the tokens. Prettier ignores the file, and `CONTRIBUTING.md` says so.
- **It never redefines a Forma UI token.** The generator refuses to emit a name Forma UI declares, and a test checks every stylesheet under `src/`, this one included, against the installed package. A product value that differs from a Forma UI token is resolved by adopting Forma UI's value, or by asking Forma UI for the change; it is not overridden here.
- **Themes switch as Forma UI's do.** The colours of the product sit under the same selectors as Forma UI's (`:root`, the dark media query for a system preference that has not been overridden, and `[data-theme='dark']`). A test compares the two sets of selectors, so a theme switch cannot reach one file and miss the other.
- **Readable pairs are tested.** The text and background pairs the file adds (the navigation ink on the selected item) must pass WCAG AA in both themes, using Forma UI's `contrastRatio`.
- **The purple is not here.** Forma UI 0.5.0 publishes `--color-purple-bg` and `--color-purple-ink`, so the provisional pair this file carried was removed from the source and the file regenerated. The components read Forma UI's tokens, and the readable-pairs test still checks the purple pair, now from Forma UI, next to the navigation one.

## Consequences

- Product-only values have one home, with a header that stops anyone from patching them in place.
- Components read layout measures and document typography from tokens instead of literals.
- The source of the tokens is not in this repository, so someone changing the file cannot regenerate it from here. That is deliberate: the generated file is the contract, and the tests above are what protects it.
- The purple pair was removed in the same change that adopted Forma UI 0.5.0, as planned.

## Alternatives considered

- **Keep writing the product tokens by hand** in a stylesheet: simple, and the layout, typography and colour values would drift from their source with nothing to tell.
- **Generate the file during the build**: it would keep the file out of git, and it would make the build depend on a source that this repository does not hold.
- **Put the product tokens in Forma UI**: they are specific to Draftroom, so they would crowd a generic library with values no other application uses.
- **Override Forma UI tokens where the product differs**: quick, and it splits the meaning of a token between two projects (ADR 0002).
- **Use CSS-in-JS or a TypeScript token module**: typed access to the values, and it would move styling out of the CSS Modules the project has chosen.
