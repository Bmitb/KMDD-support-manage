-- Mã dự án hiển thị có thể trùng; code cũ tiếp tục là khóa nội bộ duy nhất.
-- Bản ghi cũ dùng code khi display_code chưa được đặt.
ALTER TABLE projects ADD COLUMN display_code TEXT;
