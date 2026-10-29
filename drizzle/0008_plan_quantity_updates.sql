-- Giá trị nhập tay của mỗi kế hoạch; NULL dùng số liệu hiện tại từ lịch sử chế tạo.
-- Trigger batch tiếp tục cập nhật số liệu gốc, không thay đổi giá trị đã nhập tay.
ALTER TABLE plans ADD COLUMN required_override REAL DEFAULT NULL CHECK(required_override >= 0);
ALTER TABLE plans ADD COLUMN completed_override REAL DEFAULT NULL CHECK(completed_override >= 0);

CREATE TABLE quantity_updates (
  id TEXT PRIMARY KEY,
  plan_id TEXT NOT NULL REFERENCES plans(id),
  actual_before REAL NOT NULL,
  actual_after REAL NOT NULL,
  completed_before REAL NOT NULL,
  completed_after REAL NOT NULL,
  actor TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_quantity_updates_plan ON quantity_updates(plan_id);

DROP TRIGGER batch_add;
CREATE TRIGGER batch_add BEFORE INSERT ON batches
WHEN (SELECT completed_override FROM plans WHERE id=NEW.plan_id) IS NULL
BEGIN
  SELECT CASE WHEN (SELECT completed + NEW.qty > required FROM plans WHERE id=NEW.plan_id)
    THEN RAISE(ABORT,'Vượt số lượng yêu cầu') END;
END;
