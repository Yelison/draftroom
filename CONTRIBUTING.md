# Contributing

## Requirements

- Node.js 24 (`.nvmrc`) and npm 11.

## Commands

```sh
npm ci                # install exactly what the lockfile says
npm run lint          # oxlint
npm run format:check  # Prettier (use `npm run format` to fix)
npm run typecheck     # tsc -b
npm test              # Vitest
```

CI runs the same commands in the required `Static checks` job.

## Workflow

- One branch per change; open a pull request against `main`. Pull requests are squash-merged.
- Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/).
- Every new test must fail without its change: describe the mutation in the pull request.
- Do not weaken CI or skip tests to get a green build.
- Keep design files, exports and secrets out of the repository.
