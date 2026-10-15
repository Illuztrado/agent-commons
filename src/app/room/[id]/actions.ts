"use server";

import { revalidatePath } from "next/cache";
import { getSignOffTransport } from "@/lib/sign-off-transport";
import { SignOffRejectedError } from "@/lib/human-signoff";

/**
 * The human terminal step, as a form action.
 *
 * One code path for the presenter's click and no client-side copy of the state:
 * the form posts here, the record goes into the transport — exactly as it does
 * through `POST /api/sign-off`, which is the scripted path the smoke test uses —
 * and the page re-reads it. Needs the page to be hydrated, like any React form.
 *
 * A refusal (already signed off, or a card that never reached this step) is not
 * an error the presenter has to read: after revalidation the page simply shows
 * the state the transport is in.
 */
export async function confirmSignOff(formData: FormData): Promise<void> {
  const roomId = String(formData.get("room_id") ?? "");
  const hash = String(formData.get("hash") ?? "");
  const displayName = String(formData.get("display_name") ?? "");

  try {
    await getSignOffTransport().recordSignOff({
      room_id: roomId,
      hash,
      display_name: displayName,
    });
  } catch (error) {
    if (!(error instanceof SignOffRejectedError)) throw error;
  }

  revalidatePath(`/room/${roomId}`);
  revalidatePath("/");
  revalidatePath("/dashboard");
}
