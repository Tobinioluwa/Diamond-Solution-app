// Netlify Function entry point: wraps the same Express app used by server.ts (for local
// dev / a real Node host) so it can run as a serverless function instead. Netlify's redirect
// (see netlify.toml: /api/* -> /.netlify/functions/api/:splat) forwards the request here with
// event.path set to the *original* request path (e.g. /api/verify-departmental-payment), so
// the Express routes registered in server-app.ts match unchanged - no route rewriting needed.
import serverless from "serverless-http";
import { createApp } from "../../server-app";

let cachedHandler: ReturnType<typeof serverless> | null = null;

async function getHandler() {
  if (!cachedHandler) {
    const app = await createApp();
    cachedHandler = serverless(app);
  }
  return cachedHandler;
}

export const handler = async (event: any, context: any) => {
  const serverlessHandler = await getHandler();
  return serverlessHandler(event, context);
};
