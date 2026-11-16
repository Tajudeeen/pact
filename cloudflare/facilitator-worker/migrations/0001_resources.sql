CREATE TABLE IF NOT EXISTS pact_access_resources (
  resource_id TEXT PRIMARY KEY,
  content TEXT NOT NULL,
  mime_type TEXT NOT NULL CHECK (mime_type IN ('application/json','text/csv','text/plain')),
  sha256 TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
