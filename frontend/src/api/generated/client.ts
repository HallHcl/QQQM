// NOTE: unlike schema.d.ts, this file is NOT overwritten by `npm run
// generate:api` (openapi-typescript only ever (re)writes schema.d.ts). This
// is the minimal one-time wiring openapi-fetch always requires — no
// per-endpoint call code lives here or anywhere else in this pass.
import createClient from "openapi-fetch";
import type { paths } from "./schema";
import { getToken } from "../../lib/authToken";

// Paths in the generated schema already include the literal /api prefix
// (that's how the backend registers them), so baseUrl must be the origin
// only — not VITE_API_BASE_URL, which already ends in /api for the
// hand-written axios client in src/lib/api.ts.
const API_ORIGIN = (import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000/api").replace(/\/api\/?$/, "");

export const apiClient = createClient<paths>({ baseUrl: API_ORIGIN });

apiClient.use({
  onRequest({ request }) {
    const token = getToken();
    if (token) {
      request.headers.set("Authorization", `Bearer ${token}`);
    }
    return request;
  },
});
