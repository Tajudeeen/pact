import { useState } from "react";
import { api } from "../api";
import { useApp, useLoad } from "../state";
import { Badge, ErrorBox } from "./ui";
export function EntryControl() {
  const { session } = useApp();
  const state = useLoad("entry-control:" + session?.owner, (signal) =>
    api<{ paused: boolean }>("/entry-control", { signal }),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toggle = async () => {
    if (!state.value || busy) return;
    setBusy(true);
    setError(null);
    try {
      await api("/entry-control", {
        method: "PUT",
        body: { paused: !state.value.paused },
      });
      state.reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="panel trading-access">
      <div className="section-top">
        <h2>New entry control</h2>
        <Badge tone={state.value?.paused ? "amber" : "neutral"}>
          {state.value
            ? state.value.paused
              ? "PAUSED"
              : "ENTRIES ACTIVE"
            : "READING STATUS"}
        </Badge>
      </div>
      <p className="muted">
        Pause new previews, approvals and queued entries for this wallet.
        Closing, monitoring and recovery continue. This setting survives server
        restarts. Pausing cannot cancel a transaction already recorded as
        submitted.
      </p>
      <ErrorBox message={error ?? state.error} />
      <button
        className="button outline"
        disabled={!state.value || busy}
        onClick={() => void toggle()}
      >
        {busy
          ? "Saving…"
          : state.value?.paused
            ? "Resume new entries"
            : "Pause new entries"}
      </button>
      <p className="tiny muted">
        This doesn't revoke the linked operator's on-chain permissions. Use
        dreamDEX to revoke the operator. Inspect and manage any open position
        before revoking its ability to close.
      </p>
    </section>
  );
}
