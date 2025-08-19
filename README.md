# AptosDeFiHub

## Info
.dev for polling
.dev.vars for cf webhook

## Development

### Start polling
bun run dev.ts

### For webhook testing (optional)
bunx wrangler dev src/worker.ts

---

## Production

### Install Wrangler CLI
bunx wrangler login

### Deploy to Cloudflare
bunx wrangler deploy

### Set secret in production
bunx wrangler secret put BOT_TOKEN

### Set webhook after deployment (* remember the slash at the end of the url /)
curl -X POST "https://api.telegram.org/bot{BOT_TOKEN}/setWebhook" \
     -d '{"url": "https://basically-enough-clam.ngrok-free.app/"}' \
     -H "Content-Type: application/json"

---

## Scheduled
npx wrangler dev --test-scheduled

curl "http://localhost:3000/cdn-cgi/handler/scheduled"