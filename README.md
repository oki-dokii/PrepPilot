# PrepPilot: AI-Native Technical Interview Coordinator

PrepPilot is an advanced, AI-driven technical assessment and interview simulation platform. Unlike static competitive programming sites, PrepPilot dynamically generates custom interview questions (both MCQs and coding) tailored to the user's target company, role, seniority, and past weaknesses. It grades submissions, evaluates logical approaches, and generates detailed insights to help candidates improve, acting exactly like an interviewer.

## Features

- **Conversational Test Generation**: An interactive chat interface backed by Gemini AI elicits the user's target role, company, and seniority to generate a realistic, tailored test blueprint.
- **Dynamic Content Generation**: Problems are generated strictly based on real interview patterns.
- **Adaptive Mastery Tracking**: The system tracks user performance on topics (e.g., Arrays, Trees, System Design) over time, and feeds weak topics back into the test generation to enforce spaced repetition and improvement.
- **Auto-Validation Pipeline**: Any AI-generated coding problems are securely run against their own test cases server-side during generation. Inconsistent problems are automatically retried or substituted with a pre-validated fallback to guarantee 100% correct evaluations.
- **Asynchronous Grading**: The grading and detailed feedback evaluation are handled seamlessly in the background without blocking the user, simulating the async feedback loop of an interviewer.
- **Hardened Sandboxed Execution**: Code evaluations are piped to a robust external Piston engine (supporting Python, JS, C++) to safely handle infinite loops and malicious scripts.
- **Detailed Question Feedback**: Instead of just "Correct/Incorrect", the system uses AI to analyze your *specific* submitted code against the expected solution to pinpoint logic flaws or inefficient Big-O approaches.
- **Anti-Cheat Mechanics**: Strict session timers, hidden correctness for ongoing MCQs, and isolated testing environments.

## Architecture

PrepPilot operates as a modern Next.js / FastAPI stack relying on PostgreSQL and Redis.

- **Frontend**: Next.js (App Router), React, TailwindCSS, Framer Motion, and Chart.js for the dynamic Dashboard and test interfaces.
- **Backend**: FastAPI (Python), SQLAlchemy (async), and Google Gemini SDK.
- **Database**: PostgreSQL handles transactional data (Users, Sessions, Problems, Reports, and MasteryNodes).
- **Caching & State**: **Redis** is used heavily to cache active sessions to provide lightning-fast loads during active test conditions and to manage asynchronous grading statuses without hammering the database.
- **Task Queue/Background**: Grading and AI Feedback are offloaded natively using FastAPI's `BackgroundTasks`, scaling efficiently behind the scenes. *Note: The system currently avoids Kafka for task queuing in favor of lightweight built-in mechanisms and Redis status caching, allowing for minimal deployment overhead while retaining high concurrency.*

## Running Locally

### Prerequisites
- Node.js (v18+)
- Python (3.10+)
- PostgreSQL
- Redis
- Google Gemini API Key

### Backend Setup

1. Navigate to the `backend` folder.
2. Create and activate a virtual environment:
   ```bash
   python -m venv .venv
   source .venv/bin/activate
   ```
3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
4. Set up the environment variables (`.env` file):
   ```env
   DATABASE_URL=postgresql+asyncpg://user:password@localhost/preppilot
   REDIS_URL=redis://localhost:6379/0
   GEMINI_API_KEY=your_gemini_api_key_here
   SECRET_KEY=generate_a_secure_random_key
   DEBUG=True
   ```
5. Run migrations:
   ```bash
   alembic upgrade head
   ```
6. Start the server:
   ```bash
   uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
   ```

### Frontend Setup

1. Navigate to the `frontend` folder.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Set environment variable (`.env.local`):
   ```env
   NEXT_PUBLIC_API_URL=http://localhost:8000
   ```
4. Run the development server:
   ```bash
   npm run dev
   ```

## Workflow & System Mechanics

1. **Setup Phase**: The User interacts with the chat agent. The backend fetches the user's `MasteryNode` graph to identify weak areas.
2. **Generation Phase**: A test spec is dispatched to the backend. The backend spins up generation tasks. Coding problems generated are strictly verified server-side.
3. **Execution Phase**: The frontend relies on Redis-backed quick-lookups to serve test data quickly. Code execution relies on a robust API to compile, run, and scrape performance against edge cases.
4. **Grading Phase**: Submissions trigger a `BackgroundTask`. It queries the AI model to synthesize an overall report and specific code-critiques, then updates the `MasteryNode` moving average. The frontend polls Redis to know when the grading report is available.
