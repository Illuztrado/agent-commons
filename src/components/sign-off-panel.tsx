import { Button } from "@/components/ui";
import { confirmSignOff } from "@/app/room/[id]/actions";

/**
 * The human terminal step.
 *
 * Rendered only on a card that stopped at `awaiting_signature`. The form carries
 * the room id and the terms hash the person is looking at, so the confirmation
 * binds to those terms and to nothing else; the name field is optional and falls
 * back to `demo-human`.
 *
 * Nothing here holds state: the action writes to the transport and the page
 * re-reads it, which is why the board and the next page load cannot drift from
 * what this panel showed.
 */
export function SignOffPanel({ room_id, hash }: { room_id: string; hash: string }) {
  return (
    <form
      action={confirmSignOff}
      className="flex flex-col gap-2 rounded-lg border border-dashed border-neutral-300 p-3 dark:border-neutral-700"
    >
      <input type="hidden" name="room_id" value={room_id} />
      <input type="hidden" name="hash" value={hash} />
      <label className="flex flex-col gap-1 text-xs text-neutral-600 dark:text-neutral-400">
        Confirming as
        <input
          type="text"
          name="display_name"
          defaultValue=""
          placeholder="demo-human"
          maxLength={80}
          className="w-48 rounded-md border border-neutral-300 bg-white px-2 py-1 text-sm text-neutral-900 outline-none focus:border-sky-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
        />
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit">Confirm</Button>
        <span className="text-xs text-neutral-500">
          Demo-level confirmation of these terms — no legal signature validity.
        </span>
      </div>
    </form>
  );
}
