# Repository Guidelines

## Project Structure & Module Organization
`src/app` contains Next.js App Router routes, layouts, and page entrypoints for areas like `dashboard`, `note`, `wikis`, `pdf`, and auth. Put reusable UI in `src/components`, usually as feature folders with an `index.tsx` entry and any local CSS beside it. Keep shared logic in `src/hooks`, `src/utils`, `src/constants`, and `src/types`. Network calls belong in `src/requests/client` or `src/requests/server`, and Redux Toolkit state lives in `src/store`. Static assets live in `public/`, especially `public/images/`.

## Build, Test, and Development Commands
Prefer `npm` here because `package-lock.json` is checked in.

- `npm install` - install dependencies.
- `npm run dev` - start the Next.js dev server on `http://localhost:3000`.
- `npm run lint` - run ESLint using `next/core-web-vitals`.
- `npm run build` - create a production build.
- `npm run start` - serve the production build.
- `npm run tauri` - Tauri CLI entrypoint; only relevant if desktop-shell files are added locally.

`next.config.js` sets `typescript.ignoreBuildErrors = true`, so a successful build is not a type-safety check.

## Coding Style & Naming Conventions
Use TypeScript React function components and the `@/*` path alias from `tsconfig.json` for shared imports. Follow existing naming patterns: `page.tsx` and `layout.tsx` for routes, `useX.ts` for hooks, `*Slice.ts` for Redux slices, and `*Types.ts` for shared types. New code should use 2-space indentation unless the surrounding file already differs. No Prettier config is checked in, so match the touched file's local formatting and keep diffs tight.

## Testing Guidelines
There is no configured `npm test` script or committed test harness yet. For now, the minimum gate is `npm run lint` plus manual verification of changed routes, editors, or API flows. Document those manual checks in the PR. If you add automated tests, prefer colocated `*.test.ts` or `*.test.tsx` files near the feature they cover.

## Commit & Pull Request Guidelines
Recent history uses short subjects such as `fix`, `update`, and occasional prefixes like `feat: 分片上传`. Keep commit messages short, imperative, and scoped, for example `fix: prevent empty chat reload` or `feat: add wiki task filter`. PRs should state the affected routes/components, note API or config changes, link the issue when available, and include screenshots or recordings for visible UI changes.
