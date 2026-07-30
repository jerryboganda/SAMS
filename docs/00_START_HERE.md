# SAMS Academy — Autonomous AI Development Kit (START HERE)

**Project:** SAMS Academy — Medical Exam Prep LMS (NRE / USMLE / SMLE / DHA / Prometric / MBBS)
**Client:** Dr. Zabih Ullah, CEO, SAMS Academy
**Stack (fixed):** Node.js 20 LTS + Express + MySQL 8 + React 18 (Vite) — single monolith app
**Hosting (fixed):** Hostinger Business plan — ONE Node.js web app + MySQL database
**Build method:** Claude Code, running autonomously with a multi-agent team, no human intervention

---

## 1. What is in this kit

| File | Purpose |
|---|---|
| `00_START_HERE.md` | This file — how to launch the autonomous build |
| `CLAUDE.md` | Project memory / rules file. **Copy to repo root.** Claude Code reads it automatically |
| `01_PRD.md` | Product requirements (SRS translated to build scope, exclusions applied) |
| `02_ARCHITECTURE.md` | System architecture, folder structure, adapters, key design decisions |
| `03_DATABASE_SCHEMA.md` | Complete MySQL schema (DDL) + seed data plan |
| `04_API_SPEC.md` | Every REST endpoint — auth, request, response, errors |
| `05_FRONTEND_SPEC.md` | Every page, route, component, and UI state |
| `06_AGENT_TEAM.md` | Multi-agent setup — subagent definition files for `.claude/agents/` |
| `07_EXECUTION_PLAN.md` | The autonomous task list — 15 phases, checkboxes, acceptance criteria |
| `08_TESTING_QA.md` | Test strategy + mandatory test cases |
| `09_DEPLOYMENT_HOSTINGER.md` | Exact Hostinger deployment procedure |
| `10_SECURITY_CHECKLIST.md` | Security hardening mapped to SRS §12 |

## 2. Scope exclusions (permanent — do not build)

Per the owner's instruction, these SRS modules are **EXCLUDED** everywhere:

1. ❌ Live Classes
2. ❌ Notes Library (no notes upload, no notes pages, no PDF study-material module)
3. ❌ Discussion Forum
4. ❌ Certificates

Any reference to these in the original SRS is void. The database, API, UI, and admin panel must not contain them.

## 3. How to launch the autonomous build

### Step A — Prepare the workspace (one time, ~5 min)
```bash
mkdir sams-academy && cd sams-academy
git init
# Copy ALL kit files into ./docs/  (keep originals safe)
mkdir docs && cp /path/to/kit/*.md docs/
# CLAUDE.md must sit in the repo ROOT:
cp docs/CLAUDE.md ./CLAUDE.md
# Create the agent team:
mkdir -p .claude/agents
# Paste each agent block from docs/06_AGENT_TEAM.md into its own file there.
```

### Step B — Start Claude Code in full-autonomy mode
```bash
claude --dangerously-skip-permissions
```
> ⚠️ This flag lets Claude Code edit files and run commands without asking.
> Run it only inside this dedicated project folder (or a VM/container). That is the accepted trade-off for zero-intervention builds.

Alternative (safer, still hands-free): create `.claude/settings.json` with an allowlist — see `06_AGENT_TEAM.md` §5.

### Step C — Paste the kickoff prompt
```
You are the ORCHESTRATOR of an autonomous multi-agent engineering team building
SAMS Academy. Read CLAUDE.md, then read every file in ./docs/ in numeric order.

Then execute ./docs/07_EXECUTION_PLAN.md from Phase 0 to Phase 14, task by task:
- Delegate work to the subagents defined in .claude/agents/ as instructed in
  docs/06_AGENT_TEAM.md.
- After finishing each task: run its acceptance criteria, tick its checkbox
  by editing 07_EXECUTION_PLAN.md, and git-commit with a conventional message.
- NEVER stop to ask me anything. If information is missing, apply the
  "Autonomy Rules" in CLAUDE.md (use sandbox/mock mode + .env placeholders)
  and keep going.
- Do not end the session until every checkbox in every phase is ticked and
  COMPLETION_REPORT.md is written. Begin now with Phase 0.
```

### Step D — Walk away
Claude Code will loop: **plan → build → test → tick → commit → next task**. When it finishes, you will find:
- Working app: `npm run dev` (local) — student site + admin panel + API
- `COMPLETION_REPORT.md` — what was built, test results, anything mocked
- `docs/09_DEPLOYMENT_HOSTINGER.md` — follow it once to go live

## 4. The only things a human must ever provide (later, not during the build)

The build runs 100% autonomously using sandbox keys and mocks. Before **go-live** only, fill real values in `.env`:

- MySQL credentials (from Hostinger hPanel)
- Video provider API key (Bunny Stream by default — see 02_ARCHITECTURE §6)
- Payment gateway credentials (JazzCash / EasyPaisa; Raast needs only your Raast ID/IBAN/QR in Admin Settings; PayFast & Safepay are placeholder slots for later — see 02_ARCHITECTURE §7)

**Optional frontend path:** you may build the entire UI in Google AI Studio first using `11_AISTUDIO_FRONTEND_PROMPTS.md`, then drop the exported code into `client/` — Claude Code then only wires it to the real API (instructions inside doc 11).
- SMTP credentials (Hostinger email)
- `JWT_SECRET`, `APP_URL`

## 5. Session-resume rule

If a Claude Code session is interrupted (crash, context limit, restart), simply re-paste the Step C prompt. The plan file's checkboxes + git history are the persistent state; the orchestrator resumes at the first unticked task. No progress is ever lost.
