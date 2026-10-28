# Support Control – quản lý support giàn khoan

Mã nguồn của web app quản lý support, bản vẽ typical/detail, ảnh support, tiến độ chế tạo, kho vật tư và phân quyền. Bản sao này tương ứng với phiên bản 13 đã phát hành tại [Site hiện tại](https://quan-ly-support-gian-khoan.manhcaoptsc1.chatgpt.site/).

**Để tiếp tục trong chat mới:** đọc [AGENTS.md](AGENTS.md), [HANDOFF.md](HANDOFF.md) rồi README này. `HANDOFF.md` lưu yêu cầu đã chốt, phiên bản đang chạy, cấu trúc mã, cách phát hành, giới hạn và câu nhắc có thể sao chép sang chat khác.

## Thành phần

- `worker/app.js`: giao diện và API chạy trên ChatGPT Sites Worker.
- `drizzle/*.sql`: cấu trúc và các thay đổi của cơ sở dữ liệu D1.
- `.openai/hosting.json`: cấu hình Site hiện tại, gồm ID dự án và binding D1/R2.
- `scripts/build.mjs`: tạo gói Worker trong `dist/`.

## Lấy mã về và dựng lại

```powershell
git clone https://github.com/Bmitb/KMDD-support-manage.git
cd KMDD-support-manage
node --check worker/app.js
node scripts/build.mjs
```

`dist/server/index.js` và `dist/.openai/hosting.json` là kết quả dựng; thư mục `dist/` không lưu trong Git. Khi cập nhật **Site hiện tại**, dùng đúng `project_id` trong `.openai/hosting.json` và quy trình phát hành ChatGPT Sites. Khi tạo **Site mới**, phải đăng ký Site mới rồi thay `project_id`, tạo binding D1/R2, áp dụng các migration và thiết lập tài khoản admin đầu tiên.

## Giới hạn của bản sao GitHub

Repo này chỉ chứa **mã nguồn và cấu trúc dữ liệu**. Nó **không chứa** bản ghi trong D1, ảnh/PDF trong R2, tài khoản đăng nhập, secret hay các phiên bản đã phát hành. Muốn khôi phục toàn bộ dữ liệu vận hành, cần sao lưu D1 và R2 riêng từ Site đang chạy. Không đưa file xuất dữ liệu hoặc khóa bí mật vào repo.

Quyền admin/editor trong app được kiểm tra tại Worker. Người dùng đăng nhập ChatGPT lần đầu được ghi nhận là Viewer; admin trong app có thể đổi quyền.
