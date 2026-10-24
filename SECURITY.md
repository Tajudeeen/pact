# Security and trust boundaries

Do not publish a dreamDEX security vulnerability in this repository or a public issue. The bounty requests private disclosure to `security@dreamdex.io`. Do not send private keys, environment files, session cookies, signed raw transactions or unnecessary personal data in any report.

Pact uses one-use domain-bound wallet challenges, signature verification, opaque session tokens hashed in SQLite, HttpOnly/Lax cookies, exact-origin writes, input/body limits and session-owner checks. HTTPS deployments set Secure cookies. Sign-in is distinct from trading permission. Wallet signatures alone never grant the operator a new permission.

The server holds one dedicated testnet operator key in its environment. It must not be the owner's key. There is no API for reading it or setting it through the browser. The frontend is a separately bundled dependency graph and does not import the server adapter. In the Node deployment the private key is not stored in SQLite. Cloudflare instead generates its own dedicated operator key inside the private Durable Object storage, which belongs to the trusted signing boundary. There is no export endpoint. Signed action bodies are stored for recovery and must remain private with the database.

In-memory request limits are per process. The app is intended for a single process and persistent volume. Upstream rate limiting and deployment hardening are required before a public, loaded service. Treat the operator environment, host and backups as trusted.

A linked key still has authority to make losing trades. App-level approval limits are not an on-chain plan-specific mandate. The current opposing-order close path is not protocol-enforced reduce-only. Monitored exits depend on uptime and available counterparties. This version is not audited or qualified for mainnet.

The new-entry pause is a persisted application control, not on-chain revocation or cancellation of submitted transactions. Mainnet network selection is refused. Broadcast verifies the saved signed hash, signature identity, chain, pool and nonce. Observations require matching calldata, canonical receipt/block hashes and two confirmations. These checks remain RPC-relative and do not establish an independent consensus proof. See [mainnet qualification](docs/MAINNET.md).

Cloudflare deployment checks `PACT_TESTNET_OWNER` before generating its operator and restricts wallet challenges and sessions to that owner. Practice sessions remain separate, unauthenticated simulations. Never change the owner routing identity while actions or positions remain active. Durable storage, backups, code deployment permissions and the Cloudflare account are trusted. Deleting the namespace loses the signing identity and recovery data.
