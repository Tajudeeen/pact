import { Link } from "react-router";
import {
  ArrowLeft,
  ArrowUpRight,
  CheckCircle2,
  FileCheck2,
  TriangleAlert,
} from "lucide-react";
import { Badge, Mark } from "../components/ui";
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
              Actual funding settlements and native gas costs are not yet
              attributed to live receipts. Net testnet PnL stays incomplete.
            </li>
            <li>
              This version runs as a single Node process with a persistent
              SQLite volume. It is not configured for multiple replicas.
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
      <footer className="site-footer">
        <Mark />
        <span>One setup. Your terms.</span>
      </footer>
    </div>
  );
}
