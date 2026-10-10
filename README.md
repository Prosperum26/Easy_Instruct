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

## MCP tools

| Tool | Tác dụng | Có từ |
|---|---|---|
| `start_session` | Bật overlay, hiện thẻ giới thiệu | M2 |
| `show_step` | Hiện một bước: vùng sáng + bong bóng (`read` / `click` / `do`) | M2 |
| `show_card` | Hiện thẻ ở giữa màn hình | M2 |
| `wait_for_user` | Chờ người dùng: Tiếp, Xong, Bỏ qua, Hỏi, Thoát (hoặc timeout) | M2 |
| `end_session` | Thẻ tổng kết, tắt overlay khi người dùng đóng | M2 |
| `observe` | Chụp cửa sổ IDE (có thể kèm lưới tọa độ) gửi cho agent | M3 |
| `open_location` | Mở file đúng dòng trong IDE | M4 |

Ở M2, vùng sáng nhận tọa độ `{ kind: "rect", x, y, w, h }` theo pixel vật lý của màn hình chính; vùng lấn ra ngoài màn hình được cắt bớt, vùng nằm hẳn ngoài màn hình được báo trong `unresolved` và bước được hiện dạng thẻ.

## Trạng thái

🚧 Đang phát triển.

- **M1** ✅ Overlay Electron: lớp mờ, vùng sáng, bong bóng.
- **M2** ✅ MCP server: session, Lùi/Tiếp cục bộ, hỏi đáp, kênh WebSocket tới overlay, tự khởi động lại overlay khi crash.
- **M3** ⏳ Chụp màn hình cho agent, tìm cửa sổ VS Code, DPI (win-helper .NET).

## Chạy thử

```bash
npm install
npm run build
npm test                 # unit test
npm run typecheck
npm run overlay:demo     # demo các bước (đọc / click / thực hành / nhiều vùng sáng)
npm run overlay:demo -- --step=4              # mở thẳng bước 4
npm run overlay:demo -- --rect=100,200,600,80 # tô sáng đúng tọa độ pixel vật lý để kiểm tra DPI
```

Phím tắt: `Ctrl+Alt+H` ẩn/hiện lớp phủ, `Ctrl+Alt+Q` thoát. Đặt `EASY_INSTRUCT_DEBUG=1` để xem log; thêm `--capture=out.png` để overlay tự chụp phần nó vẽ rồi thoát.

### Dùng với Claude Code

```bash
npm run build
claude mcp add easy-instruct -- node C:/Dev/Project/Easy_Instruct/dist/server/index.js
```

Sau đó nhờ Claude dạy bạn một repo; Claude sẽ gọi `start_session`, `show_step`, `wait_for_user`… và overlay hiện trên màn hình.

## Yêu cầu (dự kiến)

- Windows 10/11
- Node.js ≥ 20
- .NET 10 SDK (để build win-helper)
- VS Code có lệnh `code` trong PATH
