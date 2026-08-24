import { redirect } from "next/navigation";

/**
 * Legacy route. The funnel is now one of two views on «Лиды и воронка», so old
 * links and bookmarks land on the funnel view instead of breaking.
 */
export default function FunnelRedirectPage() {
  redirect("/leads?view=funnel");
}
