# New Horizon Frontend

Next.js frontend for the investigation workflow UI.

## Clone and Run End-to-End

1. Clone repository:

```bash
git clone https://github.com/Zaidnaz/orchestra.git
cd orchestra
```

2. Install frontend dependencies:

```bash
cd demo_frontend
npm install
```

3. Ensure Python dependencies for backend agents are installed in each cloned agent repo and that Python is available in PATH.

4. Start frontend:

```bash
npm run dev
```

5. Open http://localhost:3000/input and submit a case.
6. Optional: paste a Gemini API key in the input form to run Scribe using Gemini instead of Ollama.

## Pages

- `/` landing page
- `/input` case intake form
- `/agents/sentry` to `/agents/scribe` per-agent analysis walkthrough
- `/report` final consolidated report

## Run locally

```bash
npm install
npm run dev
```

Then open `http://localhost:3000`.

## Build

```bash
npm run build
npm run start
```
