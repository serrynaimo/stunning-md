![Tidepool logo](logo.svg)

# Tidepool

A tiny, typed job queue for Node.js that keeps its state in Postgres — no Redis, no broker, no extra moving parts.

![build](https://img.shields.io/badge/build-passing-brightgreen) ![npm](https://img.shields.io/badge/npm-v2.4.1-blue) ![license](https://img.shields.io/badge/license-MIT-lightgrey)

## Why Tidepool

Most queues ask you to run another piece of infrastructure. Tidepool uses the database you already have, and leans on `SKIP LOCKED` to hand out work safely.

### Transactional enqueue

Enqueue a job in the same transaction as the write that caused it. Either both happen or neither does.

### Typed end to end

Payloads are validated at the boundary and inferred everywhere else. No `any`, no casts.

### Boring operations

One table, three indexes. Back it up, replicate it and inspect it with the tools you already use.

### Fair by default

Per-tenant concurrency limits stop one noisy customer from starving the rest.

## Install

```bash
npm install tidepool pg
npx tidepool migrate --database-url "$DATABASE_URL"
```

> [!NOTE]
> Tidepool needs Postgres 12 or newer. Migrations are idempotent and safe to run on every deploy.

## Usage

Define a job once, then enqueue it from anywhere in your application.

```ts
import { defineJob, createWorker } from "tidepool"
import { z } from "zod"

export const sendWelcome = defineJob({
  name: "send-welcome",
  payload: z.object({ userId: z.string().uuid() }),
  retries: 5,
  async run({ userId }, { log }) {
    const user = await users.find(userId)
    await mailer.send(user.email, "welcome")
    log.info("sent", { userId })
  },
})

// Enqueue inside your own transaction.
await db.transaction(async (tx) => {
  const user = await users.create(tx, input)
  await sendWelcome.enqueue({ userId: user.id }, { tx })
})

createWorker({ jobs: [sendWelcome], concurrency: 8 }).start()
```

A Python client is available for services that only need to enqueue:

```python
from tidepool import Client

client = Client(dsn=os.environ["DATABASE_URL"])
client.enqueue("send-welcome", {"userId": str(user.id)}, run_at=tomorrow)
```

## Retry backoff

Failed jobs are retried with exponential backoff and full jitter. The delay before attempt $n$ is drawn uniformly from zero up to a capped exponential:

$$
d_n \sim U\!\left(0,\ \min\left(d_{\max},\ d_0 \cdot 2^{\,n-1}\right)\right)
$$

With the defaults $d_0 = 2\,\text{s}$ and $d_{\max} = 15\,\text{min}$, five retries cover roughly an hour.

## Configuration

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `concurrency` | `number` | `4` | Jobs processed in parallel by one worker. |
| `pollInterval` | `number` | `1000` | Milliseconds between polls when the queue is empty. |
| `retries` | `number` | `3` | Attempts after the first failure before a job is parked. |
| `timeout` | `number` | `30000` | Milliseconds before a running job is considered stuck. |
| `tenantLimit` | `number` | `∞` | Maximum concurrent jobs per tenant key. |

## Benchmarks

Throughput on a 4‑vCPU Postgres 16 instance, 1 KB payloads, one worker process.

| Concurrency | Tidepool | pg-boss | Graphile Worker |
| --- | --- | --- | --- |
| 1 | 1,150 | 780 | 1,020 |
| 4 | 4,300 | 2,650 | 3,900 |
| 8 | 7,900 | 4,400 | 7,100 |
| 16 | 12,400 | 6,100 | 11,300 |
| 32 | 15,800 | 6,900 | 14,200 |

## Roadmap

- [x] Transactional enqueue
- [x] Per-tenant concurrency limits
- [x] Cron schedules
- [ ] Web dashboard
- [ ] Batch completion callbacks
- [ ] OpenTelemetry spans

## Releases

| Date | Version | Highlights |
| --- | --- | --- |
| 2024-03-11 | 1.0 | First stable release with retries and scheduling. |
| 2024-09-02 | 1.5 | Cron schedules and the Python enqueue client. |
| 2025-02-18 | 2.0 | Typed payloads, new migration runner. |
| 2025-11-05 | 2.4 | Per-tenant fairness and stuck-job recovery. |

## License

MIT. Contributions are welcome — please open an issue before starting on anything large.
