-- Bốn chỉ số nhập thủ công của từng module trên trang Support.
ALTER TABLE modules ADD COLUMN available_count INTEGER NOT NULL DEFAULT 0 CHECK(available_count >= 0);
ALTER TABLE modules ADD COLUMN model_3d_count INTEGER NOT NULL DEFAULT 0 CHECK(model_3d_count >= 0);
ALTER TABLE modules ADD COLUMN typical_count INTEGER NOT NULL DEFAULT 0 CHECK(typical_count >= 0);
ALTER TABLE modules ADD COLUMN detail_count INTEGER NOT NULL DEFAULT 0 CHECK(detail_count >= 0);
