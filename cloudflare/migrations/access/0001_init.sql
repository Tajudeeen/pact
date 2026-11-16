CREATE TABLE IF NOT EXISTS pact_access_requests (
  request_id TEXT PRIMARY KEY,
  seller_id TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  buyer_agent_id TEXT NOT NULL,
  owner_account TEXT NOT NULL,
  payer_account TEXT NOT NULL,
  network TEXT NOT NULL,
  challenge TEXT NOT NULL UNIQUE,
  policy_id TEXT NOT NULL,
  message TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('proof_required','proof_verified','payment_pending','paid','delivered','blocked')),
  challenge_consumed_at TEXT,
  payment_reference TEXT,
  delivered_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS pact_access_requests_agent_created
  ON pact_access_requests(buyer_agent_id, created_at DESC);
CREATE INDEX IF NOT EXISTS pact_access_requests_state_expiry
  ON pact_access_requests(state, expires_at);

CREATE TABLE IF NOT EXISTS pact_access_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id TEXT NOT NULL REFERENCES pact_access_requests(request_id),
  state TEXT NOT NULL,
  at TEXT NOT NULL,
  reason_code TEXT,
  registry_reference TEXT,
  payment_reference TEXT
);
CREATE INDEX IF NOT EXISTS pact_access_audit_request
  ON pact_access_audit(request_id, id);
