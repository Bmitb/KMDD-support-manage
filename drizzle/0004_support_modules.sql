CREATE TABLE support_modules (
  support_id TEXT NOT NULL REFERENCES supports(id),
  module_id TEXT NOT NULL REFERENCES modules(id),
  PRIMARY KEY (support_id, module_id)
);
CREATE INDEX idx_support_modules_module ON support_modules(module_id);
