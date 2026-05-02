# Deals AI

Local web dashboard for scanning Gmail for likely creator brand deal emails.

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

4. Add your Google OAuth client credentials to `.env.local`.

Required redirect URI in Google Cloud:

```text
http://localhost:3000/api/gmail/auth/callback
```

5. Start the app:

```bash
npm run dev
```

6. Open `http://localhost:3000`.

## Notes

- The current MVP focuses on the Intake Agent and manual Gmail scans.
- OAuth tokens are stored locally in `data/gmail-oauth-tokens.json` and are ignored by Git.
- `.env.local` is ignored by Git and should contain real OAuth secrets only on your machine.
