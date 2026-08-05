# Repository Guidelines

## Project Structure & Module Organization

- `src/` contains the Vue 3 application.
- `src/pages/` holds file-based routes. A file such as `model-management.vue` maps to `/model-management`.
- `src/stores/` contains Pinia stores for Local Dream API state, gallery history, settings, and reuse payloads.
- `src/utils/` contains browser-compatible helpers such as image encoding, IndexedDB access, and API configuration.
- `src/assets/css/` contains Tailwind and Element Plus theme overrides.
- `public/` contains static assets. Docker, Nginx, and deployment configuration live in the repository root.

## Build, Test, and Development Commands

On Windows PowerShell, use `npm.cmd` because `npm.ps1` may be blocked by execution policy.

- `npm.cmd install` - install dependencies.
- `npm.cmd run dev` - start the Vite dev server.
- `npm.cmd run type-check` - run `vue-tsc`.
- `npm.cmd run lint` - run oxlint and ESLint with auto-fix.
- `npm.cmd run build` - type-check and build the production bundle.
- `npm.cmd run format` - format `src/` with Prettier.
- `docker-compose up -d --build` - build and run the Nginx production container.

## Coding Style & Naming Conventions

- Use TypeScript and Vue `<script setup lang="ts">`.
- Use PascalCase for component/page filenames and kebab-case in markup where appropriate.
- Use camelCase for TypeScript variables and functions.
- Follow the existing Prettier configuration: 2 spaces, single quotes, semicolons, and a 100-character print width.
- Reuse Tailwind CSS utility patterns and Element Plus components instead of introducing a new UI abstraction.
- Keep API usage behind the `LdApi`-backed store and browser compatibility helpers.

## Testing Guidelines

No automated test framework is currently configured. Use `npm.cmd run type-check`, `npm.cmd run lint`, and `npm.cmd run build` as the required verification before submitting changes. If shared utility logic grows, add focused tests and document the test command in this file.

## Commit & Pull Request Guidelines

Repository history uses short commit messages. Prefer concise imperative messages or conventional prefixes such as `feat:`, `fix:`, and `refactor:`. Pull requests should describe the user-facing change, mention API or deployment impact, and include UI screenshots when visual behavior changes.

## Configuration & Deployment Tips

- `VITE_LD_API_BASE` controls the frontend API base; the default is `/`.
- Docker runtime variables `LD_API_8808` and `LD_API_8081` configure Nginx proxy targets.
- Keep frontend routes distinct from API paths such as `/models`; the model management page currently uses `/model-management`.
- Never commit tokens, credentials, or private backend addresses beyond the existing local defaults.
