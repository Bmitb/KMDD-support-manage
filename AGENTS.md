# Hướng dẫn cho agent tiếp tục dự án

Đọc `HANDOFF.md` rồi `README.md` trước khi sửa mã. Trả lời người dùng bằng tiếng Việt.

- Đây là app Support Control đang chạy trên ChatGPT Sites. Thông tin dự án, phiên bản và giới hạn được ghi trong `HANDOFF.md`; xác minh trạng thái hiện tại trước khi phát hành.
- Mã ứng dụng nằm trong `worker/app.js`; file này chứa cả Worker API và HTML/CSS/JavaScript trong template literal `PAGE`. Kiểm tra cả cú pháp Worker lẫn JavaScript thực tế trả về cho trình duyệt.
- Repo GitHub là riêng tư. Giữ nguyên chế độ này. Không commit token, secret, dữ liệu D1 hoặc file R2.
- GitHub và kho nguồn của Sites là hai kho riêng. Push GitHub không tự cập nhật website. Dùng skill/tool Sites hiện có để đồng bộ nguồn, đóng gói, lưu phiên bản và phát hành Site khi được yêu cầu.
- Khi cập nhật Site cũ, giữ đúng `project_id` trong `.openai/hosting.json`, D1 binding `DB`, R2 binding `BUCKET`; không tạo Site/database mới để né lỗi quyền truy cập.
- Đăng nhập đang dùng ChatGPT. Google OAuth và Cloudflare Access chưa được tích hợp. Chỉ tin identity headers do Sites cung cấp tại môi trường Sites; không đưa nguyên cơ chế đó sang hosting khác mà thiếu lớp xác thực đáng tin cậy.
- Người mới đăng nhập mặc định là Viewer; không tự nâng thành admin. Quyền admin trong app khác quyền owner/editor của dự án Sites.
- Dữ liệu vận hành đang có người sử dụng. Giữ các migration đã áp dụng, thêm migration mới nếu cần; không reset database. Không tự thay dữ liệu thật để thử giao diện.
- Thực hiện kiểm tra phù hợp với thay đổi. Chỉ báo đã phát hành khi tool Sites trả kết quả thành công; phân biệt kiểm tra cú pháp với kiểm tra trình duyệt thực tế.
- Sau thay đổi, cập nhật `HANDOFF.md` và đẩy source/tài liệu đã được người dùng yêu cầu lên GitHub. Ghi rõ bản nào mới chỉ ở GitHub, bản nào đã chạy trên Site.
