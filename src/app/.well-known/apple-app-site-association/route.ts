import { APP_SITE_ASSOCIATION } from "@/lib/app-links";

/**
 * Tells iOS that the fnnzhrn app (mobile/) belongs to this site, so it suggests the passwords saved
 * for fnnzhrn.ch in the app's sign-in and offers to save new ones. Apple fetches this once per install.
 */
export function GET() {
  return Response.json(APP_SITE_ASSOCIATION);
}
