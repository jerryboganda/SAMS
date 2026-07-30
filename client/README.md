# SAMS Academy — Client

React 18 + TypeScript + Vite + Tailwind frontend for SAMS Academy. Originally scaffolded as a UI export from Google AI Studio (see `../docs/11_AISTUDIO_FRONTEND_PROMPTS.md` for the prompt pack used to generate it), now wired to the real backend — see `../CLAUDE.md §1a` and `../DECISIONS.md` for integration notes.

No build-time environment variables are required (see `.env.example`); `CONFIG.API_BASE_URL` in `src/config.ts` is hardcoded to `/api/v1`, same-origin.

## Run locally

Standalone (client only, against nothing — pages will fail to fetch):
```
npm install
npm run dev
```

For the full stack, use the root `npm run dev`, which boots the server and this client together (proxying `/api` to the Express server on port 5000). See the repo root `CLAUDE.md` for the full command list (`npm run build`, `npm start`, `npm run test`, `npm run verify`).
