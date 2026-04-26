/**
 * Cloudflare Worker cron handler — runs in the V8 isolate (not in the container).
 *
 * Responsibilities:
 *   1. Receive the cron tick via the scheduled handler.
 *   2. Wake the TranscoderContainer Durable Object singleton.
 *   3. The DO starts the container if it is not already running; the container
 *      runs `node dist/index.js` (which calls runOnce() and exits naturally).
 *
 * Excluded from the main tsc build (see tsconfig.json) — the container build
 * only needs index.ts. Type-checked separately via tsconfig.worker.json.
 *
 * Deploy: `wrangler deploy` from this directory (see wrangler.toml).
 * Docs:   https://developers.cloudflare.com/containers/
 */

import { Container } from "@cloudflare/containers";

export class TranscoderContainer extends Container<Env> {
  // Keep the DO (and the container) alive for up to 10 minutes of inactivity.
  // After that, onActivityExpired() (from the base class) calls stop().
  override sleepAfter = "10m";

  // Our container runs a one-shot CLI (runOnce) — there is no HTTP server
  // to proxy to. We just need to wake it; the container transcodes and exits.
  override async fetch(_request: Request): Promise<Response> {
    await this.start();
    return new Response("started", { status: 202 });
  }
}

export default {
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    const id = env.TRANSCODER_DO.idFromName("singleton");
    const stub = env.TRANSCODER_DO.get(id);
    // waitUntil keeps the isolate alive while the DO fetch settles.
    ctx.waitUntil(stub.fetch(new Request("https://do/run")));
  },
};

interface Env {
  TRANSCODER_DO: DurableObjectNamespace<TranscoderContainer>;
}
