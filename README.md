# Webhook Delivery Engine

A small reliability-focused service that delivers webhooks on behalf of a system that needs to notify other services when something happens (a payment succeeds, an order ships, a document gets signed, etc). Instead of firing a webhook straight off the request and hoping for the best, this engine queues it, signs it, retries it if it fails, and puts it in a dead-letter queue if it never comes through so nothing just silently disappears.



## What This System Does

When an event happens, you POST it to this service with a destination URL and a payload. The service:

1. Saves the event and returns immediately (it does **not** try to deliver the webhook inside that request).
2. A background worker picks it up and sends it to the destination via HTTP POST.
3. Every payload is HMAC-signed so the receiver can trust it actually came from us and wasn't tampered with.
4. If delivery fails, it retries on a backoff schedule instead of giving up immediately.
5. If it fails 5 times, it gets moved to a dead-letter queue where it can be inspected and manually replayed.
6. The event's ID never changes across retries or replays, so a receiver that gets the same event twice can recognize the duplicate and ignore it.

Basically: assume the receiver will be down sometimes, and design so that's fine.

## Setup & Configuration

Clone the repo and install dependencies:

```bash
git clone https://github.com/momanyidora/webhook-delivery-engine.git
cd webhook-delivery-engine
npm install
```

Create a `.env` file in the project root 
```
DATABASE_URL=postgres://postgres:yourpassword@localhost:5432/webhook_delivery_db
WEBHOOK_SIGNING_SECRET=your-secret-here
PORT=3000
```

Then create the database and run the schema (tables for `events` and `delivery_attempts`):

```bash
sudo -u postgres psql
CREATE DATABASE webhook_delivery_db;
\c webhook_delivery_db
\i schema.sql
```

Start the API:

```bash
npm run dev
```

## Running the Worker

Delivery happens off the request path, in a separate process. Open a second terminal and run:

```bash
npm run worker
```

This starts a loop that polls the `events` table for anything with a `status` of `pending` (or `failed`, if it's due for another attempt) and a `next_attempt_at` that has already passed, and attempts delivery. Because the schedule lives in Postgres and not in memory, if the worker crashes or the machine restarts, nothing gets lost the worker just picks back up where it left off next time it polls.

## Running Tests

```bash
npm run test:run
```

This runs the Vitest suite, which covers the retry schedule, HMAC signing, the delivery service, event creation, and replay behavior both success and failure paths.

## Sending an Event for Delivery

```bash
curl -X POST http://localhost:3000/events \
  -H "Content-Type: application/json" \
  -d '{
    "destination": "https://example.com/webhook",
    "payload": {
      "orderId": 101,
      "status": "paid"
    }
  }'
```

Response:

```json
{
  "id": "f145e013-397e-459c-8dfc-9a4cf5200f52",
  "destination": "https://example.com/webhook",
  "payload": { "orderId": 101, "status": "paid" },
  "status": "pending",
  "attempts": 0,
  "next_attempt_at": "2026-07-04T12:41:19.950Z",
  "created_at": "2026-07-04T12:41:19.950Z"
}
```

The event is created with `status: pending` and picked up by the worker on the next poll the request itself doesn't wait around for delivery to happen.

## The Retry Schedule

If a delivery attempt fails (anything that isn't a 2xx response including timeouts and no response at all), it's retried on this schedule:

| Attempt | Delay before it |
|---|---|
| 1 | immediate |
| 2 | 1 minute |
| 3 | 5 minutes |
| 4 | 30 minutes |
| 5 | 2 hours |

After the 5th failed attempt, the event stops retrying automatically and moves to the dead-letter queue instead. A successful attempt at any point stops all further retries the event just gets marked `delivered` and left alone.

Each event tracks its own `attempts` count and `next_attempt_at` timestamp in the database, so the worker knows exactly what's due and when.

## Payload Signing (and How Receivers Verify It)

Every payload is signed with HMAC-SHA256 using a secret that lives only in the server's environment (`WEBHOOK_SIGNING_SECRET`) it's never sent in the request itself.

The signature goes out in a header:

```
X-Signature: <hmac-sha256 hex digest of the JSON payload>
X-Event-ID: <event id>
```

**To verify it on the receiving end**, compute an HMAC-SHA256 of the exact request body you received, using the same shared secret, and compare it to the value in `X-Signature`. If they match, the payload is authentic and hasn't been altered in transit. If they don't match or the header is missing reject the request.

Example (Node.js receiver):

```js
const crypto = require("crypto");

function isValidSignature(rawBody, signature, secret) {
  const expected = crypto
    .createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex");

  return expected === signature;
}
```

## The Dead-Letter Queue

Once an event has failed all 5 attempts, it's moved into the dead-letter queue instead of just getting dropped. Its full attempt history stays in the `delivery_attempts` table, so you can see exactly what happened on every try.

View what's currently dead-lettered:

```bash
curl http://localhost:3000/events/dead-letters
```

```json
[
  {
    "id": "f145e013-397e-459c-8dfc-9a4cf5200f52",
    "destination": "https://example.com/webhook",
    "attempts": 5,
    "payload": { "orderId": 101, "status": "paid" },
    "updated_at": "2026-07-04T12:42:33.297Z"
  }
]
```

An event that succeeds at any point before attempt 5 is never dead-lettered, and once something is dead-lettered it's not touched again by the background worker it just sits there until someone replays it.

## Replaying a Delivery

Dead-lettered (or just currently-failed) events can be manually re-sent:

```bash
curl -X POST http://localhost:3000/events/f145e013-397e-459c-8dfc-9a4cf5200f52/replay
```

This resets the event's `status` back to `pending`, zeroes out `attempts`, and sets `next_attempt_at` to now so it behaves like a fresh delivery, and the worker picks it up on its next pass. Importantly, **it reuses the original event ID**, it doesn't generate a new one, since receivers rely on that ID staying stable to detect duplicates.

Trying to replay an event that doesn't exist returns a 404:

```json
{ "message": "Event not found" }
```

## The Idempotency Design

Retries and replays both mean a receiver can end up getting the exact same event more than once for example, if the webhook actually arrived but our record of that response got lost, or someone manually replays something that technically already went through.

To make that safe:

- Every event gets a UUID the moment it's created.
- That ID **never changes**, no matter how many times it's retried or replayed.
- The ID is sent with every single delivery attempt, in the `X-Event-ID` header, so a receiver doesn't have to dig through the payload body to find it.

The receiver's side of the contract is: keep a record of event IDs you've already processed (even just recently-seen ones in a table or cache), and if an incoming `X-Event-ID` matches one you've already handled, skip re-processing it and just return a 2xx so we stop retrying. Since the ID is stable and always present in the header, that check is cheap and doesn't require parsing the payload at all.

## Endpoint Health & Auto-Pause

**Not implemented in this submission.** I got through Phases 1–5 (delivery, signing, background processing + retries, dead-letter + replay, and idempotency/tests/docs) but ran out of time before I could build out the health scoring and auto-pause behavior from the requirement injection. Given more time, the plan would be:

- Track a rolling success rate per destination from the `delivery_attempts` table.
- Convert that into a 0–100 health score, recalculated as new outcomes come in.
- Automatically flag and pause any destination whose score drops below 20, and skip it in the worker's polling query until it's manually unpaused.

## Known Limitations

- Endpoint health scoring and auto-pause (EXT-001 / EXT-002) are not implemented yet see above.
- The worker polls the database on an interval rather than using a proper job queue (like BullMQ/Redis-backed), so there's a small window of latency between an attempt being "due" and actually being picked up.
- There's no authentication on the API endpoints themselves yet anyone who can reach the service can create or replay events.
- Retry delays are real-time (1m / 5m / 30m / 2h), so end-to-end testing of the full schedule takes hours unless you use the shortened delays in the retry simulation tests.
- No pagination on `GET /events/dead-letters` fine for now, but would need it if the DLQ grows large.