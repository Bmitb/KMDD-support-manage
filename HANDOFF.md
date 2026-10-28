# Bàn giao Support Control

Cập nhật: 28/10/2026, múi giờ Asia/Bangkok. Tài liệu giúp chat/agent mới tiếp tục mà không cần lịch sử cuộc trò chuyện. Đây là ảnh chụp trạng thái; kiểm tra phiên bản hiện tại trước khi làm tiếp.

## Mục đích và quyết định đã chốt

App quản lý support cho hệ thống giàn khoan, sử dụng trên điện thoại và máy tính. Người dùng theo dõi loại support theo dự án/module, số lượng thực tế cần chế tạo, số đã hoàn thành, bản vẽ và ảnh; đồng thời ghi nhập/xuất kho nguyên vật liệu thực tế.

- Trạng thái: Chưa làm / Đang làm / Hoàn thành.
- Mỗi support xem được PDF typical, PDF detail và ảnh support. Người dùng dự kiến tải PDF đúng một trang.
- File hiện lưu trong kho của app (R2). Có đường xử lý liên kết Google Drive cũ; không coi Drive là kho chính hiện tại.
- Site mở công khai để xem; đăng nhập ChatGPT để nhận danh tính và kiểm tra quyền sửa. Không có đăng nhập Google trực tiếp hoặc Cloudflare Access được triển khai. Người dùng đã chọn quay lại ChatGPT.
- Admin quản lý dự án, module, support, file và phân quyền. Editor có các quyền nghiệp vụ như ghi nhận chế tạo, phiếu kho theo kiểm tra hiện có trong `act()`. Viewer chỉ xem.
- Repo GitHub được người dùng chuyển sang Private trước khi đưa mã lên. Ưu tiên giải pháp ít chi phí; không tự đăng ký dịch vụ trả phí.

## Định danh và trạng thái phát hành

- GitHub: https://github.com/Bmitb/KMDD-support-manage
- Nhánh: `main`; repo riêng tư.
- Site: https://quan-ly-support-gian-khoan.manhcaoptsc1.chatgpt.site/
- Site project ID: `appgprj_6adf12900aec8191be6d2b0e2a9013e6` (cũng nằm trong `.openai/hosting.json`).
- Phiên bản Site gần nhất đã xác nhận phát hành trong cuộc trò chuyện: **14**.
- Saved version ID: `appgprj_6adf12900aec8191be6d2b0e2a9013e6~appgver_5e74d75a7e248191aefa0e5df254fe79`.
- Deployment ID thành công: `appgdep_6ae1edbadcd481918a94f74a8439b94e`.
- Commit của **kho nguồn Sites** dùng cho v14: `30f9f299121414ffd29541f1ac53cf7c7c97bac9`.
- GitHub được khởi tạo bằng một bản sao sạch của source v8 và thêm README/build script. Lịch sử commit GitHub khác kho nguồn Sites; không dùng SHA của GitHub để gọi lưu phiên bản Sites khi chưa đồng bộ sang kho nguồn Sites.
- Commit GitHub đã xác minh chứa bản sao nguồn trước khi bổ sung bàn giao: `b5c9e55db766353a94a67f58cb1277262d27d39f`.

Tài liệu bàn giao và hướng dẫn agent là thay đổi trong GitHub, không phải phiên bản tính năng mới của Site.

## Những tính năng đã làm gần đây

**v7:** Tài khoản ChatGPT mới được tự thêm vào bảng `members` với role `viewer`, xuất hiện trong Phân quyền khi admin tải lại dữ liệu. Bấm nền tối ngoài hộp thoại sẽ đóng hộp thoại. Nút đăng nhập chỉ hiện cho khách và ghi “Đăng nhập bằng ChatGPT”.

**v8:** Admin có thể Ctrl+V ảnh khi đang xem support hoặc trong form Thêm/Sửa support. App nhận PNG/JPG/WebP, mở form/xem trước và chỉ upload khi bấm Lưu. Vẫn giữ chọn file. Giới hạn ảnh 10 MB; PDF 25 MB.

**v9:** Bộ lọc dự án/module và tìm mã/tên support áp dụng cho cả bảng kế hoạch và danh mục loại support. Một loại support có thể xuất hiện ở nhiều module thông qua các kế hoạch tương ứng; khi chọn dự án/module, danh mục chỉ hiện loại đã có kế hoạch trong phạm vi đó. Module ở Quản trị và bộ lọc khi xem tất cả dự án hiển thị kèm mã dự án. Chuyển tab tải lại dữ liệu; lựa chọn bộ lọc không còn hợp lệ được xóa sau khi tải lại. Vùng trống có thông báo rõ. Không thay đổi schema hay dữ liệu D1/R2.

**v10:** Form Thêm/Sửa loại support chọn module từ Quản trị (có thể nhiều module, nhóm theo dự án). Mã support hiển thị tự lấy từ mã module; tên do admin nhập. Một module có thể có nhiều loại support cùng mã hiển thị, và một loại dùng ở nhiều module. Bảng `support_modules` lưu liên kết trực tiếp, không cần kế hoạch; kế hoạch mới tự bổ sung liên kết. Các màn hình, tìm kiếm và CSV hiển thị mã module theo ngữ cảnh; `supports.code` trong D1 giữ vai trò khóa nội bộ duy nhất, không dùng làm mã hiển thị cho bản ghi mới. Với bản ghi cũ chưa liên kết, UI nhận diện module khi mã cũ khớp duy nhất; khi sửa support hoặc mã module, liên kết được lưu. Module đã có kế hoạch không thể bỏ liên kết trong form. Migration `0004_support_modules.sql` chỉ tạo bảng/index, không sửa dữ liệu cũ. Site xác nhận deploy thành công và bảng mới xuất hiện trong D1.

**v11:** Nhãn module trong danh mục Support, bảng tiến độ, chi tiết và ô mã tự hiện của form Thêm/Sửa loại support hiển thị cả mã và tên, ví dụ `ELE-MD · Laddersup`. Tìm kiếm khớp cả tên module. Giá trị mã trong D1 vẫn giữ nguyên; CSV có nhãn đầy đủ ở cột Module và mã gốc ở cột Mã support. Không có migration hoặc sửa dữ liệu.

**v12:** Mã bản vẽ trong form tải/thay PDF Typical và Detail là tùy chọn; API chấp nhận chuỗi rỗng, giao diện hiển thị gọn khi không có mã. Đóng hộp thoại bằng cách bấm nền chỉ xảy ra khi nhấn và thả ngay trên nền, không đóng khi kéo chọn từ bên trong ra ngoài. `/api/state` đọc các bảng bằng một batch D1, chuyển tab hiển thị ngay bằng dữ liệu đã tải và làm mới nền tối đa một lần mỗi 5 giây. Không có migration hoặc sửa dữ liệu vận hành.

**v13:** Ô tìm kiếm ở Tổng quan và Support có nhãn “Tìm theo mô tả hoặc tên support”. Cả bảng kế hoạch và danh mục loại support chỉ khớp theo `supports.description` hoặc `supports.name`, không tìm theo mã/tên module. Không có migration hay sửa dữ liệu.

**v14:** Cho phép nhiều dự án có cùng mã hiển thị nhưng tên khác nhau. Migration `0005_project_display_code.sql` thêm cột `display_code`; mã `projects.code` cũ vẫn là khóa nội bộ duy nhất, bản ghi cũ hiển thị mã cũ khi chưa có `display_code`. Dự án mới dùng mã nội bộ tạo từ ID, mã người dùng nhập lưu ở `display_code`; khi sửa dự án chỉ cập nhật mã hiển thị và tên. Các liên kết module, kho và kế hoạch vẫn dựa trên `projects.id`. Các ô chọn dự án trong phiếu kho hiện cả mã và tên để phân biệt mã trùng.

Kiểm tra v14: cú pháp Worker và JavaScript nhúng, build, toàn bộ migration trên SQLite thử với hai dự án chung mã hiển thị, sửa tên/mã hiển thị và xác nhận module cũ vẫn liên kết đúng ID; Sites deploy thành công. Chưa nhập bản ghi thử trên dữ liệu Site đang vận hành.

Kiểm tra v13: cú pháp Worker và script nhúng, build, kiểm tra lọc bằng tên/mô tả trên dữ liệu mẫu và xác nhận mã module không còn khớp; đóng gói và kết quả phát hành Sites thành công. Chưa kiểm thử nhập liệu trực tiếp trên Site bằng tài khoản Admin trong trình duyệt.

## Bản đồ mã và dữ liệu

- `worker/app.js`: toàn bộ app; không dùng React/Vinext và không có thư viện npm bắt buộc.
- `member(request, db)`: đọc `oai-authenticated-user-id` và `oai-authenticated-user-email`, đối chiếu hoặc tự ghi nhận Viewer.
- `permit()` và `act()`: kiểm tra quyền và xử lý thay đổi nghiệp vụ.
- API: `GET /api/state`, `POST /api/action`, `POST /api/upload`, `GET /api/file/<id>`.
- `PAGE`: template HTML/CSS/JS. Chú ý escape khi sửa JavaScript bên trong template literal.
- UI chính: `render()`, `management()`, `showPlan()`, `showSupport()`, `supportForm()`, `drawingForm()`.
- Dán ảnh: `imageFromClipboard()`, xử lý `onpaste` trong `supportForm()` và `bindDocumentActions()`.
- Đóng hộp thoại: listener trên `#modal` chỉ đóng khi target có class `dialog`, không phải khi bấm bên trong hộp.
- D1 binding: `DB`. R2 binding: `BUCKET`.
- Các bảng: `members`, `projects`, `modules`, `supports`, `support_modules`, `plans`, `batches`, `drawings`, `materials`, `stock_moves`, `stock_slips`, `files`, `audit`.
- Migration: `0000_initial.sql` (schema/trigger nghiệp vụ), `0001_stock_slips.sql`, `0002_files.sql`, `0003_admin_guard.sql` (giữ ít nhất một admin), `0004_support_modules.sql` (liên kết support–module), `0005_project_display_code.sql` (mã dự án hiển thị cho phép trùng).
- `plans.required`: số lượng thực tế cần chế tạo; `plans.completed`: số đã làm. Đây không phải tồn kho nguyên vật liệu. Trigger từ `batches` cập nhật tiến độ; trigger từ `stock_moves` cập nhật tồn kho và chặn tồn âm.
- `files.object_key` liên kết bản ghi D1 với object R2. Phải sao lưu cả hai nếu muốn khôi phục file đầy đủ.

## Quy trình tiếp tục và phát hành

1. Clone repo riêng tư bằng tài khoản GitHub có quyền, đọc tài liệu này, kiểm tra `git status` và source mới nhất. Không cần lịch sử chat cũ.
2. Nếu sửa Site, đọc skill Sites đang được cung cấp trong phiên; gọi lấy thông tin Site bằng project ID trên để xác minh owner/editor, URL, audience và phiên bản hiện tại. Quyền trên GitHub không tự cấp quyền phát hành Sites.
3. Dùng kho nguồn chính thức của Sites theo workflow của skill. Sửa file nguồn `worker/app.js`, không sửa duy nhất file đã dựng trong `dist/`.
4. Trong repo GitHub này, chạy `node --check worker/app.js` và `node scripts/build.mjs`. Build chỉ sao chép Worker cùng manifest sang `dist/`; không tự áp dụng database migration hay phát hành.
5. Kiểm tra thêm script nhúng và các hành vi bị ảnh hưởng. Cú pháp Worker hợp lệ không bảo đảm JavaScript trong HTML hợp lệ.
6. Đồng bộ đúng nguồn sang kho Sites, tạo archive theo helper Sites (bao gồm migration), lưu phiên bản bằng SHA đã push vào kho Sites, rồi phát hành Site hiện tại. Giữ nguyên audience trừ khi người dùng yêu cầu đổi.
7. Khi tool xác nhận thành công, cập nhật phiên bản/commit và phạm vi kiểm thử trong tài liệu này, rồi đồng bộ GitHub nếu đang thực hiện yêu cầu lưu mã. Push GitHub đơn thuần không phát hành website.

Sites quản lý `/signin-with-chatgpt`, `/signout-with-chatgpt`, `/callback`. Không tự triển khai chồng lên các đường này. Mã dùng identity do Sites cấp; muốn chạy trên Cloudflare riêng hoặc máy chủ khác phải thiết kế lớp xác thực phù hợp.

Nếu tạo Site mới từ mã này, đăng ký project ID mới, tạo binding DB/BUCKET, áp dụng schema và thiết lập admin đầu tiên bằng quyền quản trị database đáng tin cậy. Không có bootstrap admin tự động trong source. Không tự tạo Site mới khi người dùng chỉ yêu cầu cập nhật Site cũ.

## Giới hạn và điểm cần biết

- **Chưa sao lưu dữ liệu D1/R2 lên GitHub.** Repo và ZIP chỉ có mã/schema. Dữ liệu support, quyền tài khoản, lịch sử, ảnh và PDF thật vẫn ở Site.
- Site công khai cho phép khách đọc dữ liệu support và file; chỉ admin nhận danh sách thành viên/audit trong `/api/state`. Không mô tả file là riêng tư nếu chưa đổi cơ chế truy cập.
- Thu hồi hiện xóa dòng `members`; người đó đăng nhập/lấy dữ liệu lại sẽ được thêm lại với role Viewer. Đây là thu hồi quyền sửa, không phải chặn quyền xem Site công khai.
- Danh sách phân quyền tải qua `/api/state`; chưa có cập nhật realtime/polling riêng giữa các trình duyệt.
- PDF một trang là yêu cầu/hướng dẫn UI; backend kiểm tra chữ ký PDF và dung lượng nhưng chưa kiểm tra số trang.
- Upload trực tiếp hiện chỉ hỗ trợ ảnh và PDF; có hỗ trợ liên kết DWG trong mã cũ, chưa có upload DWG trực tiếp.
- Xuất “Excel” hiện là CSV, chưa phải `.xlsx`.
- Backdrop đóng cả form đang nhập; chưa có cảnh báo dữ liệu chưa lưu.
- Các giới hạn này là ghi nhận trạng thái, không phải yêu cầu tự mở rộng tính năng. Sửa theo yêu cầu tiếp theo của người dùng.

## Thông tin môi trường của phiên bàn giao

Máy Windows/PowerShell. Bản repo GitHub cục bộ hiện ở `C:\Users\Admin\Documents\Codex\2026-10-26\toi\work\support-control-github`. Các bản sao khác (`sites/support-control-release`, `work/site-publish`) có thể khác lịch sử Git; không mặc định chúng mới hơn repo GitHub hoặc nguồn Sites.

GitHub plugin chưa được kết nối ở lần bàn giao; đã push thành công qua Git CLI và Git Credential Manager có sẵn. Không cần xin người dùng gửi token vào chat. Trong sandbox Windows, GCM từng lỗi khởi chạy `sh.exe`; chạy thao tác Git cần quyền phù hợp qua cơ chế phê duyệt công cụ đã giải quyết. Chỉ dùng phạm vi truy cập người dùng cho phép.

Kho Sites từng lỗi DNS khi shell thiếu quyền mạng. Các helper PTY từng tạo archive nhưng không thoát; kiểm tra kết quả thực tế và trạng thái remote, không suy luận việc publish từ tiến trình còn chạy. Luôn giữ credential trong bộ nhớ/stdin và không lưu vào tài liệu hay source.

## Câu nhắc dùng trong chat mới

> Tiếp tục dự án Support Control tại repo riêng tư https://github.com/Bmitb/KMDD-support-manage. Hãy đọc AGENTS.md, HANDOFF.md và README.md trước, kiểm tra source và trạng thái Site hiện tại. Yêu cầu tiếp theo của tôi là: [ghi việc cần làm]. Trả lời bằng tiếng Việt; cập nhật tài liệu bàn giao sau khi hoàn thành.
