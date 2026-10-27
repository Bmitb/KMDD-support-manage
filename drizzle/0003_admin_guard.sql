CREATE TRIGGER protect_last_admin_update
BEFORE UPDATE OF role ON members
WHEN OLD.role='admin' AND NEW.role!='admin' AND (SELECT COUNT(*) FROM members WHERE role='admin') <= 1
BEGIN SELECT RAISE(ABORT,'Cần giữ ít nhất một Admin'); END;
CREATE TRIGGER protect_last_admin_delete
BEFORE DELETE ON members
WHEN OLD.role='admin' AND (SELECT COUNT(*) FROM members WHERE role='admin') <= 1
BEGIN SELECT RAISE(ABORT,'Cần giữ ít nhất một Admin'); END;
