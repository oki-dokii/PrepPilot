# PrepPilot 🚀

**AI-powered coding interview prep** — generates original assessments, judges your code against hidden tests, then explains exactly why you failed.

## Stack

| Layer | Tech |
|---|---|
| Frontend | Next.js 14 (App Router), TypeScript, Tailwind, Monaco |
| Backend | FastAPI (Python 3.12), SQLAlchemy async, Alembic |
| DB | Postgres 16, Redis 7 |
| Sandbox | Judge0 API |
| LLM | Anthropic Claude |

## Quick Start

```bash
# 1. Copy and fill in secrets
cp .env.example .env

# 2. Start everything
docker compose up --build

# 3. Open the app
open http://localhost:3000
# API docs at http://localhost:8000/docs
```

## Project Structure

```
PrepPilot/
├── frontend/          # Next.js app
│   └── src/
│       ├── app/       # Pages (App Router)
│       ├── components/
│       └── lib/       # API client, auth context
├── backend/           # FastAPI app
│   └── app/
│       ├── core/      # config, db, security
│       ├── models/    # SQLAlchemy ORM
│       ├── routers/   # API endpoints
│       └── services/  # business logic
├── docker-compose.yml
└── .env.example
```

## Environment Variables

See [`.env.example`](.env.example) — you need:
- `ANTHROPIC_API_KEY` — for test generation and grading
- `JUDGE0_API_KEY` — for code execution (free tier at rapidapi.com)
- `SECRET_KEY` — generate with `openssl rand -hex 32`
