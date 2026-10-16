import { redirect } from "next/navigation";

/** The overview is the home page now; keep the old link working. */
export default function OverviewRedirect() {
  redirect("/");
}
