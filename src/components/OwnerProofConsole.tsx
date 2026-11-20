import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Check, Copy, Fingerprint, LoaderCircle, LockKeyhole, ShieldCheck } from "lucide-react";
import { accessApi, AccessApiError } from "../access/api";
import { createConcordiumOwnerProof } from "../access/concordium-wallet";

interface AccessChallenge {
  requestId: string;
  challenge: string;
  expiresAt: string;
  policyId: string;
  message: string;
}

interface SignedProof {
  account: string;
  verifiedAt: string;
  expiresAt: string;
}

const agentIdPattern = /^[1-9A-HJ-NP-Za-km-z]{20,80}$/;

export function OwnerProofConsole() {
  const [agentId, setAgentId] = useState("");
  const [challenge, setChallenge] = useState<AccessChallenge | null>(null);
  const [proof, setProof] = useState<SignedProof | null>(null);
  const [busy, setBusy] = useState<"challenge" | "sign" | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [clock, setClock] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setClock(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const validAgent = useMemo(() => agentIdPattern.test(agentId.trim()), [agentId]);
  const remainingMs = challenge ? Math.max(0, Date.parse(challenge.expiresAt) - clock) : 0;
  const expired = Boolean(challenge && remainingMs === 0);
  const remainingLabel = `${Math.floor(remainingMs / 60_000)}:${String(Math.floor((remainingMs % 60_000) / 1000)).padStart(2, "0")}`;
  const accessRemainingMs = proof ? Math.max(0, Date.parse(proof.expiresAt) - clock) : 0;
  const accessExpired = Boolean(proof && accessRemainingMs === 0);
  const accessRemainingLabel = `${Math.floor(accessRemainingMs / 60_000)}:${String(Math.floor((accessRemainingMs % 60_000) / 1000)).padStart(2, "0")}`;

  const issueChallenge = async () => {
    setBusy("challenge");
    setError("");
    setProof(null);
    setChallenge(null);
    try {
      const result = await accessApi<AccessChallenge>("/access/challenges", {
        method: "POST",
        body: { buyerAgentId: agentId.trim() },
      });
      if (!result.requestId || !result.message || !Number.isFinite(Date.parse(result.expiresAt))) {
        throw new Error("Pact returned an incomplete challenge. No proof was created.");
      }
      setChallenge(result);
    } catch (cause) {
      setError((cause as Error).message || "Pact could not issue a challenge.");
    } finally {
      setBusy(null);
    }
  };

  const signChallenge = async () => {
    if (!challenge || expired) return;
    setBusy("sign");
    setError("");
    try {
      const walletProof = await createConcordiumOwnerProof(challenge.message);
      if (Date.parse(challenge.expiresAt) <= Date.now()) {
        setChallenge(null);
        throw new Error("The challenge expired while signing. Request a fresh challenge.");
      }
      const verification = await accessApi<{
        requestId: string;
        status: "verified";
        verifiedAccount: string;
        verifiedAt: string;
        expiresAt: string;
        policyId: string;
      }>("/access/proofs", {
        method: "POST",
        body: {
          requestId: challenge.requestId,
          proof: walletProof.headerValue,
        },
      });
      if (
        verification.status !== "verified" ||
        verification.requestId !== challenge.requestId ||
        verification.verifiedAccount !== walletProof.account ||
        !Number.isFinite(Date.parse(verification.verifiedAt)) ||
        !Number.isFinite(Date.parse(verification.expiresAt)) ||
        Date.parse(verification.expiresAt) <= Date.now()
      ) {
        throw new Error("Pact could not confirm the owner signature. The resource remains locked.");
      }
      setProof({
        account: walletProof.account,
        verifiedAt: verification.verifiedAt,
        expiresAt: verification.expiresAt,
      });
    } catch (cause) {
      if (cause instanceof AccessApiError && [401, 403, 409, 410].includes(cause.status)) {
        setChallenge(null);
        setProof(null);
      }
      setError((cause as Error).message || "Pact could not verify the Concordium owner signature.");
    } finally {
      setBusy(null);
    }
  };

  const copyHandoff = async () => {
    if (!challenge || !proof || accessExpired) return;
    const handoff = JSON.stringify({
      method: "GET",
      url: "/api/access/resource",
      headers: {
        "x-pact-access-request": challenge.requestId,
      },
    }, null, 2);
    try {
      await navigator.clipboard.writeText(handoff);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setError("Clipboard access failed. Copy the verified request ID into your buyer-agent configuration.");
    }
  };

  return (
    <section className="access-console" id="owner-proof">
      <div className="access-console-intro">
        <div className="access-kicker">TRY THE OWNER GATE</div>
        <h2>prove control.<br/><em>keep your identity private.</em></h2>
        <p>Request a short-lived challenge for an active CIS-8004 agent, then sign the exact message with its Concordium owner wallet.</p>
        <div className="access-console-points">
          <span><ShieldCheck size={14}/> server-issued challenge</span>
          <span><LockKeyhole size={14}/> one-time proof</span>
          <span><Fingerprint size={14}/> no identity documents</span>
        </div>
      </div>
      <div className="access-console-panel">
        <div className="access-console-top">
          <span>PACT / OWNER VERIFICATION</span>
          <span className="access-console-state"><i/> TESTNET FLOW</span>
        </div>
        <>
            <label className="access-console-label" htmlFor="pact-agent-id">CIS-8004 buyer agent ID</label>
            <input
              id="pact-agent-id"
              className="access-console-input"
              value={agentId}
              onChange={(event) => {
                setAgentId(event.target.value.trim());
                setChallenge(null);
                setProof(null);
                setError("");
              }}
              autoComplete="off"
              spellCheck={false}
              placeholder="Paste the active agent token address"
              aria-describedby="pact-agent-help"
            />
            <p className="access-console-help" id="pact-agent-help">Use the token address from the trusted Agent Registry. Pact resolves the owner and payment wallet from the registry.</p>
            <button className="access-console-button" onClick={() => void issueChallenge()} disabled={!validAgent || busy !== null}>
              {busy === "challenge" ? <><LoaderCircle size={15} className="access-spin"/> Requesting challenge</> : <>Request owner challenge <ArrowRight size={15}/></>}
            </button>
            {!validAgent && agentId.length > 0 && <p className="access-console-inline-error">Enter a valid base58 CIS-8004 token address.</p>}
            {challenge && (
              <div className="access-challenge-card">
                <div className="access-challenge-heading"><span>{proof ? "OWNER VERIFIED" : "CHALLENGE ISSUED"}</span><span>{proof ? (accessExpired ? "ACCESS WINDOW EXPIRED" : `ACCESS WINDOW ${accessRemainingLabel}`) : (expired ? "EXPIRED" : `SIGN WITHIN ${remainingLabel}`)}</span></div>
                <div className="access-challenge-row"><small>REQUEST ID</small><code>{challenge.requestId}</code></div>
                <div className="access-challenge-row"><small>POLICY</small><code>{challenge.policyId}</code></div>
                <p className="access-console-help">The message binds your owner signature to this request, agent, seller, resource and payment wallet.</p>
                {proof ? (
                  <div className="access-proof-ready" role="status">
                    <Check size={16}/>
                    <div><strong>Owner signature verified by Pact</strong><small>{proof.account} · {new Date(proof.verifiedAt).toLocaleTimeString()}</small></div>
                  </div>
                ) : (
                  <button className="access-console-button secondary" onClick={() => void signChallenge()} disabled={expired || busy !== null}>
                    {busy === "sign" ? <><LoaderCircle size={15} className="access-spin"/> Waiting for Concordium wallet</> : <>Connect wallet and sign <Fingerprint size={15}/></>}
                  </button>
                )}
                {proof && (
                  <button className="access-console-button" onClick={() => void copyHandoff()} disabled={accessExpired}>
                    {copied ? <><Check size={15}/> Handoff copied</> : <><Copy size={15}/> Copy buyer-agent handoff</>}
                  </button>
                )}
                <p className="access-console-help">Pact verified the signature against the owner's latest Concordium account credentials. The copied handoff contains only the verified request id. Your buyer agent still needs to complete x402 payment before Pact releases any resource.</p>
              </div>
            )}
            {error && <p className="access-console-error" role="alert">{error}</p>}
          </>
        <div className="access-console-foot"><span>FAIL-CLOSED BY DEFAULT</span><span>NO PAYMENT FROM THIS SCREEN</span></div>
      </div>
    </section>
  );
}
