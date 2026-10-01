import type { IncomingMessage, ServerResponse } from "node:http";
import type { ProggaaEventReceiver } from "./ProggaaEventReceiver";

export const EVENTS_PATH = "/proggaa/events";
const MAX_BODY_BYTES = 64 * 1024;

/**
 * Node http handler for POST /proggaa/events. Reads the raw body (the
 * signature covers the exact bytes, so it must not be re-serialised) and hands
 * it to the receiver.
 */
export function createEventsHandler(receiver: ProggaaEventReceiver) {
  return (req: IncomingMessage, res: ServerResponse): void => {
    const reply = (status: number, body: string) => {
      res.writeHead(status, { "Content-Type": "text/plain" });
      res.end(body);
    };

    if (req.method !== "POST") return reply(405, "POST only.");

    const chunks: Buffer[] = [];
    let size = 0;
    let tooLarge = false;

    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        tooLarge = true;
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("error", () => {
      if (!res.headersSent) reply(400, "Could not read the request.");
    });
    req.on("close", () => {
      if (tooLarge && !res.headersSent) reply(413, "Too large.");
    });
    req.on("end", () => {
      const signature = req.headers["x-proggaa-signature"];
      receiver
        .handle(Buffer.concat(chunks).toString("utf8"), Array.isArray(signature) ? signature[0] : signature)
        .then((result) => reply(result.status, result.body))
        .catch(() => reply(500, "Internal error."));
    });
  };
}
