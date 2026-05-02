# AI Product Strategist MVP

Chat-first web MVP for product leads to recommend what to build, draft PM artifacts, and debug metric changes.

## Run

1. Install Node.js 20 or newer.
2. Install dependencies:

```bash
npm install
```

3. Copy env vars:

```bash
cp .env.example .env.local
```

4. Start the app:

```bash
npm run dev
```

5. Open `http://localhost:3000`.

## Notes

- The app works in mock mode without `OPENAI_API_KEY`.
- Uploaded files are stored under `data/uploads/`.
- Workspace state is stored in `data/pm-agent-state.json`.
