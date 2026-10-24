import { Link } from "react-router";
import {
  ArrowLeft,
  ArrowUpRight,
  CheckCircle2,
  FileCheck2,
  TriangleAlert,
} from "lucide-react";
import { Badge, Mark, Footer } from "../components/ui";
export function Evidence() {
  return (
    <div className="evidence-page">
      <header className="site-header">
        <Link to="/">
          <Mark />
        </Link>
        <Link to="/app" className="button outline small">
          Open workspace <ArrowUpRight size={16} />
        </Link>
      </header>
      <main>
        <Link to="/" className="back">
          <ArrowLeft size={15} /> Home
        </Link>
        <Badge>BUILT TO BE CHECKED</Badge>
        <h1>
          Every claim needs
          <br />
          <em>a short path to proof.</em>
        </h1>
        <p className="evidence-intro">
          Pact separates what it simulates, what it observes, and what still
          needs verification.
        </p>
        <div className="evidence-grid">
          <section className="panel">
            <CheckCircle2 size={27} />
            <h2>Try the complete practice flow.</h2>
            <p>
              Choose a setup, preview with a standard account, approve, inspect
              the fill, close and download a receipt.
            </p>
            <Link to="/app" className="muted-link">
              Open practice setups <ArrowUpRight size={16} />
            </Link>
          </section>
          <section className="panel">
            <TriangleAlert size={27} />
            <h2>Challenge the happy path.</h2>
            <p>
              Try the late account, old-data account and lost-response account.
              Inspect the reason for each refusal and the reconciliation
              timeline.
            </p>
          </section>
        </div>
        <section className="panel">
          <h2>What the evidence means</h2>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Evidence</th>
                  <th>Establishes</th>
                  <th>Doesn’t establish</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Practice receipt</td>
                  <td>Behavior of the deterministic simulator</td>
                  <td>A blockchain transaction or real market fill</td>
                </tr>
                <tr>
                  <td>Setup digest</td>
                  <td>Identity of recorded plan terms</td>
                  <td>An independent timestamp or trade</td>
                </tr>
                <tr>
                  <td>Confirmed transaction</td>
                  <td>Inclusion and receipt status</td>
                  <td>A fill unless matching fill events exist</td>
                </tr>
                <tr>
                  <td>Monitored protection</td>
                  <td>A running process checks exits</td>
                  <td>An exchange-native stop or guaranteed maximum loss</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
        <section className="evidence-limits">
          <h2>Verify an exported testnet receipt.</h2>
          <p>
            Download a closed testnet order's receipt and run the read-only
            checker from the source repository:
          </p>
          <pre>
            <code>pnpm run verify:receipt ./pact-receipt.json</code>
          </pre>
          <p>
            It re-reads both transactions, checks their canonical blocks,
            decodes fills with the official SDK, and compares owner, market,
            quantity, side and price bounds. Practice receipts, changed setup
            terms and mismatched fills are refused. Complete cost claims are
            rebuilt from canonical bank events, including fees, rebates, signed
            funding and realized USDso PnL. Native STT gas stays separate. It
            doesn't prove off-chain consent or security.
          </p>
          <Badge tone="amber">MAINNET BLOCKED</Badge>
          <p>
            This release only executes on Tokyo testnet. Mainnet requires
            published perps deployments, qualified closing and protection, real
            accounting evidence, recovery and security checks, and a bounded
            pilot. Deploying this frontend does not enable mainnet trading.
          </p>
          <h2>Current limits, stated plainly.</h2>
          <ul>
            <li>
              Actual testnet order evidence has not been recorded by this build
              yet. Practice is not a substitute.
            </li>
            <li>
              Linked bot keys cannot arm native TP/SL. Monitoring stops when the
              executor is offline.
            </li>
            <li>
              Linked-key closing uses a position-sized opposing FOK order. The
              SDK does not expose a reduce-only flag on that path. Dedicated
              accounts and no outside trading are required.
            </li>
            <li>
              Live fees, rebates, funding and realized PnL use a resumable
              bank-event ledger. Missing coverage keeps net PnL unknown. This is
              tested with controlled chain fixtures; real filled-order
              qualification is pending.
            </li>
            <li>
              Actual native gas is recorded separately when transaction proof is
              available. No STT-to-USDso exchange rate is assumed. A closed
              testnet trade with incomplete costs blocks further entries for
              that account in the same UTC day.
            </li>
            <li>
              Cloudflare runs one persistent SQLite Durable Object per operator
              lane, with alarms for recovery and monitoring. Alarm timing and
              RPC availability can delay exits.
            </li>
            <li>
              Wallet sign-in currently supports EOA personal signatures. QR
              pairing and smart-account sign-in are not implemented.
            </li>
          </ul>
          <a
            href="https://github.com/Tajudeeen/pact"
            target="_blank"
            rel="noreferrer"
            className="button outline"
          >
            Source & run instructions <ArrowUpRight size={16} />
          </a>
          <p className="tiny muted">
            The repository is currently private. Access requires its owner’s
            permission.
          </p>
        </section>
      </main>
      <Footer />
    </div>
  );
}
