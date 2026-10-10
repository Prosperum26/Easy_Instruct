# Easy Instruct

> AI dạy bạn thao tác trên máy tính từng bước, giống phần hướng dẫn lần đầu trong app hay game, nhưng kịch bản do AI soạn riêng cho đúng tình huống của bạn.

## Ý tưởng

Easy Instruct là một **MCP server**. Khi AI agent (Claude Code, Cursor, Copilot…) cần *dạy* bạn thay vì chỉ trả lời bằng chữ, nó bật một **lớp phủ toàn màn hình**:

- làm mờ màn hình và tô sáng đúng vùng cần chú ý bằng viền phát sáng;
- hiện bong bóng giải thích ngay cạnh: phần này là gì, dùng để làm gì, bạn cần làm gì;
- bạn bấm **Tiếp** hoặc tự thao tác, AI quan sát kết quả, giải thích lỗi nếu có rồi dẫn tiếp cho tới khi bạn đạt mục tiêu.

```
░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
░░░░┏━━━━━━━━━━━━━━━━━━━━━━━━┓░░░░░░░░░░░░░░░░░░░░░
░░░░┃ def create_app():      ┃◀─┌────────────────────────┐
░░░░┃   app = FastAPI()      ┃  │ Bước 3/9 · Khởi tạo app │
░░░░┃   app.include_router() ┃  │ Hàm này tạo app và gắn  │
░░░░┗━━━━━━━━━━━━━━━━━━━━━━━━┛  │ các router…             │
░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  │ [◀ Lùi] [Hỏi] [Tiếp ▶]  │
░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  └────────────────────────┘
```

### Nguyên tắc

- **AI là não, Easy Instruct là tay và mắt.** Easy Instruct chỉ *hiển thị*, *định vị* và *quan sát*. Việc hiểu code và soạn giáo án là của agent.
- **Bạn tự làm mọi thao tác.** AI chỉ chỉ ra vùng cần click hay terminal cần gõ lệnh, và không bao giờ làm thay.
- **Không bao giờ kẹt.** Nếu không định vị được mục tiêu trên màn hình, bong bóng vẫn hiện kèm mô tả bằng chữ.
- **Chạy local.** Không theo dõi bàn phím; ảnh chụp chỉ nằm trong bộ nhớ.

## Phạm vi đầu tiên (MVP)

Dạy người dùng **khám phá và đọc hiểu một repo vừa clone** trong **VS Code** trên **Windows**: cấu trúc thư mục → README → entry point → luồng chính → cài đặt → chạy app → chạy test.

## Kiến trúc

```
AI Agent ──MCP stdio──▶ MCP Server (TypeScript) ──WebSocket──▶ Overlay (Electron)
                              │
                              └──JSON-lines──▶ win-helper (.NET 10: UI Automation, OCR, chụp màn hình)
```

| Thư mục | Vai trò |
|---|---|
| `src/server` | MCP tools & prompts, điều phối |
| `src/session` | State machine của một bài học |
| `src/locator` | Biến mục tiêu (file + dòng, panel, chữ…) thành tọa độ trên màn hình |
| `src/observer` | Chụp màn hình gửi cho agent |
| `src/ide` | Gọi CLI của IDE (`code -g file:line`) |
| `src/helper-client` | Client giao tiếp với win-helper |
| `src/shared` | Kiểu dữ liệu, chuyển đổi tọa độ/DPI |
| `overlay/` | Ứng dụng Electron vẽ lớp phủ |
| `native/win-helper/` | Tiến trình .NET gọi API Windows |
| `prompts/` | Hướng dẫn sư phạm cho agent |
| `config/` | Bảng ánh xạ UI của VS Code |

## MCP tools (dự kiến)

| Tool | Tác dụng |
|---|---|
| `start_session` | Bật overlay, hiện thẻ giới thiệu |
| `show_step` | Hiện một bước: vùng sáng + bong bóng (`read` / `click` / `do`) |
| `wait_for_user` | Chờ người dùng: Tiếp, Xong, click trúng vùng sáng, Hỏi, Thoát |
| `observe` | Chụp cửa sổ IDE (có thể kèm lưới tọa độ) gửi cho agent |
| `open_location` | Mở file đúng dòng trong IDE |
| `show_card` | Hiện thẻ ở giữa màn hình |
| `end_session` | Thẻ tổng kết, tắt overlay |

## Trạng thái

🚧 Đang ở giai đoạn khởi tạo, chưa có code chạy được.

## Yêu cầu (dự kiến)

- Windows 10/11
- Node.js ≥ 20
- .NET 10 SDK (để build win-helper)
- VS Code có lệnh `code` trong PATH
