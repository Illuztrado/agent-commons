/**
 * Dev-only harness: a Firestore datastore on localhost that needs no Java and
 * no Google credentials. Data lives in memory and is gone when the process
 * exits. Never imported by app code — only by scripts and for local review.
 *
 *   npm run emulator:firestore                 # port 8931
 *   FIRESTORE_TEST_PORT=9100 npm run emulator:firestore
 *
 * Then point the app at it:
 *   TRANSPORT=firestore FIRESTORE_EMULATOR_HOST=127.0.0.1:8931 \
 *     FIRESTORE_PROJECT_ID=agent-commons-local npm run dev
 */
import { FirestoreServer } from "@firestore-emulator/server";

const port = Number(process.env.FIRESTORE_TEST_PORT ?? 8931);
const server = new FirestoreServer();
await server.start(port);
console.log(`firestore emulator listening on 127.0.0.1:${port}`);
console.log(
  [
    `  TRANSPORT=firestore \\`,
    `  FIRESTORE_EMULATOR_HOST=127.0.0.1:${port} \\`,
    `  FIRESTORE_PROJECT_ID=agent-commons-local npm run dev`,
  ].join("\n"),
);
console.log("data is in-memory only; Ctrl-C to discard");

for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, () => {
    server.stop();
    process.exit(0);
  });
}
