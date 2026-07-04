# Webhook Delivery Engine

A reliability-focused backend service that delivers webhooks for systems that need to notify other services when events occur, such as successful payments, shipped orders, or signed documents. Instead of sending webhooks directly during a request, the engine processes them asynchronously through a background worker, signs every payload with HMAC to verify authenticity, retries failed deliveries using a fixed backoff schedule, and moves events that exhaust all retry attempts to a dead-letter queue for inspection and replay. It also preserves a stable event identifier across retries and replays to support idempotent processing and monitors the health of destination endpoints, automatically pausing those that consistently fail to prevent unnecessary delivery attempts.


## What This System Does

Say some other system in our product needs to be notified when something happens a payment went through, an order shipped, whatever. Instead of just firing off an HTTP request and hoping for the best, this engine:

- Accepts the event (payload + destination URL) and immediately returns, without waiting for delivery
- Delivers it in the background via a worker process
- Retries it on a fixed backoff schedule if it fails
- Signs the payload so the receiver can verify it actually came from us
- Moves it to a dead-letter queue after it's failed too many times, instead of just losing it
- Lets you manually replay a dead-lettered (or failed) event
- Tracks how healthy each destination is, and stops sending to ones that are clearly broken

## Setup & Configuration

You'll need Node, npm, and PostgreSQL running locally.

```bash
git clone https://github.com/momanyidora/webhook-delivery-engine.git
cd webhook-delivery-engine
npm install
```

Create a `.env` file in the root (don't commit this):

```
DATABASE_URL=postgres://postgres:yourpassword@localhost:5432/webhook_delivery_db
PORT=3000
WEBHOOK_SIGNING_SECRET=some-long-random-secret
```

The secret is what's used to sign payloads see the signing section below. It's never hardcoded anywhere in the code, it's pulled from the environment.

Then create the database and run the table setup (events, delivery_attempts, and endpoints tables). I don't have a migration tool set up yet, so for now I just ran the CREATE TABLE statements directly in psql. That's on my known limitations list below.

## Running the Worker

The API and the worker are two separate processes. The API just accepts events and writes them to the DB it does not deliver anything itself. A background worker polls the database for events that are due and actually sends them.

Start the API:

```bash
npm run dev
```

Start the worker (in a separate terminal):

```bash
npm run worker
```

If you only start the API and not the worker, events will just sit in `pending` forever, which is expected nothing gets delivered synchronously inside the request.

## Running Tests

```bash
npm run test:run
```

This runs everything in `/tests` once and exits (good for CI). If you want it to watch files while you work, just run `npm run test` instead.

Tests cover the retry schedule, HMAC signature generation, replay behaviour, and the basic delivery/event flows, including both success and failure cases.

## Sending an Event for Delivery

**Example 1 creating an event:**

```bash
curl -X POST http://localhost:3000/events \
  -H "Content-Type: application/json" \
  -d '{
    "destination": "https://webhook.site/your-unique-url",
    "payload": { "orderId": 101, "status": "paid" }
  }'
```

Response:

```json
{
  "id": "f145e013-397e-459c-8dfc-9a4cf5200f52",
  "destination": "https://webhook.site/your-unique-url",
  "payload": { "orderId": 101, "status": "paid" },
  "status": "pending",
  "attempts": 0,
  "next_attempt_at": "2026-07-04T12:41:19.950Z"
}
```

The event is created with `status: pending` and picked up by the worker on its next poll nothing is sent synchronously in this request.

## The Retry Schedule

Failed deliveries follow a fixed backoff schedule:

| Attempt | Delay before it |
|---|---|
| 1 | immediate |
| 2 | 1 minute |
| 3 | 5 minutes |
| 4 | 30 minutes |
| 5 | 2 hours |

After the 5th failed attempt, the event is dead-lettered and is not retried automatically anymore. A successful attempt at any point stops all further retries the event's `status` moves to `delivered` and the worker leaves it alone.

Each event tracks its own `attempts` count and `next_attempt_at` timestamp in the database, so the schedule survives a restart of the worker process it's not held in memory anywhere.

**Example 2 checking on an event's retry state:**

```sql
SELECT id, status, attempts, next_attempt_at FROM events;
```

## Payload Signing (and How Receivers Verify It)

Every payload is signed with HMAC-SHA256 using a secret from the environment (`WEBHOOK_SIGNING_SECRET`), computed over the JSON payload. The signature is sent as a header, `X-Signature`, along with the event's own id in `X-Event-ID`. The secret itself is never sent anywhere.

To verify a delivery, a receiver would:

1. Take the raw request body
2. Compute `HMAC-SHA256(body, shared_secret)` themselves
3. Compare it against the `X-Signature` header
4. If they match, the payload is genuine and untampered; if not, reject it

## The Dead-Letter Queue

If an event fails all 5 attempts, its `status` is set to `dead_letter` and the worker stops touching it. Its full attempt history stays in the `delivery_attempts` table, so you can see exactly what happened on every try.

**Example 3 listing dead-lettered events:**

```bash
curl http://localhost:3000/events/dead-letters
```

```json
[
  {
    "id": "f145e013-397e-459c-8dfc-9a4cf5200f52",
    "destination": "https://webhook.site/your-unique-url",
    "attempts": 5,
    "payload": { "orderId": 101, "status": "paid" },
    "updated_at": "2026-07-04T12:42:33.297Z"
  }
]
```

## Replaying a Delivery

```bash
curl -X POST http://localhost:3000/events/f145e013-397e-459c-8dfc-9a4cf5200f52/replay
```

This resets the event's `status` back to `pending`, resets `attempts` to 0, and sets `next_attempt_at` to now, so the worker picks it up again on its next pass. Importantly, it **keeps the same event id** nothing about the event's identity changes, only its delivery state. Replaying an event that doesn't exist returns a 404 instead of silently doing nothing.

## The Idempotency Design

Since events get retried automatically and can also be replayed manually, a receiver might genuinely get the same webhook more than once (e.g. the delivery worked but our confirmation never came back). To make that safe:

- Every event has a stable UUID assigned when it's first created
- That same id is sent in the `X-Event-ID` header on every single attempt, whether it's a normal retry or a manual replay
- The id never changes across retries or replays only the delivery attempt count and status change

So on the receiving end, you'd keep a record of event ids you've already processed. If a webhook comes in with an id you've already seen, you just acknowledge it and skip processing it again, instead of double-charging a card or double-shipping an order or whatever the side effect would be.

## Endpoint Health & Auto-Pause

This part was added mid-sprint as a requirement injection, after most of the core engine was already working.

Each destination endpoint (not each individual event I initially built this at the event level and then moved it into its own `endpoints` table once I realized the requirement was really about the endpoint) has a `health_score` between 0 and 100, starting at 100.

- A successful delivery bumps the score up by 10 (capped at 100)
- A failed delivery drops the score by 20 (floored at 0)
- If an endpoint's score drops below 20, it's automatically marked `paused`

A paused endpoint stops receiving delivery attempts entirely the worker's query for due events explicitly filters out anything tied to a paused endpoint, so it just sits there instead of continuing to hammer a dead URL.

**Check endpoint health:**

```bash
curl http://localhost:3000/events/health
```

```json
[
  {
    "destination": "http://localhost:9999/webhook",
    "health_score": 0,
    "paused": true
  },
  {
    "destination": "https://webhook.site/your-unique-url",
    "health_score": 100,
    "paused": false
  }
]
```

## Known Limitations

- No proper migration tool yet table changes were applied by hand in `psql`, so setting this up fresh means running the CREATE TABLE / ALTER TABLE statements yourself in order.
- Once an endpoint is paused, there's no automatic un-pause. You'd currently have to manually reset its health score in the database to bring it back into rotation.
- The health score logic is intentionally simple  rather than a proper rolling success-rate calculation over a time window good enough to demonstrate the behaviour for this sprint, but I'd want to revisit it for anything real.
- Retry timing is checked by polling rather than a true scheduled job queue, so there's a small delay between when something becomes "due" and when the worker actually picks it up, depending on the poll interval.
- Test coverage exists for the core behaviours but isn't exhaustive on every edge case yet I focused on the ones the sprint explicitly asked for (retry schedule, dead-letter after 5, success stopping retries).