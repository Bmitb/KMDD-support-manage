CREATE TABLE files (
  id TEXT PRIMARY KEY,
  object_key TEXT NOT NULL UNIQUE,
  purpose TEXT NOT NULL CHECK(purpose IN ('support_image','typical','detail')),
  mime TEXT NOT NULL,
  filename TEXT NOT NULL,
  size_bytes INTEGER NOT NULL CHECK(size_bytes > 0),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
