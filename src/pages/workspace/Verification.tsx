import { OwnerProofConsole } from "../../components/OwnerProofConsole";

export function Verification() {
  return (
    <div className="workspace-page workspace-verification-page">
      <div className="workspace-page-heading"><div><div className="workspace-eyebrow">REQUEST-BOUND ACCOUNT PROOF</div><h1>Owner verification</h1><p>Prove control of the current Concordium owner account for a specific CIS-8004 agent request.</p></div><span className="workspace-readonly-pill">CONCORDIUM TESTNET</span></div>
      <OwnerProofConsole/>
      <div className="workspace-notice"><strong>What this proves:</strong><p>A valid signature proves control of the Concordium account key that signed the exact challenge. It does not establish age, nationality, uniqueness, or any other identity attribute.</p></div>
    </div>
  );
}
