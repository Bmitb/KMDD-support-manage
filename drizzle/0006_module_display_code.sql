-- Mã module hiển thị có thể trùng trong cùng dự án.
-- code hiện có giữ làm khóa nội bộ; bản ghi cũ hiển thị code khi cột mới chưa có giá trị.
ALTER TABLE modules ADD COLUMN display_code TEXT;
