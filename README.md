# Easy Instruct

> AI dạy bạn thao tác trên máy tính từng bước, giống phần hướng dẫn lần đầu trong app hay game, nhưng kịch bản do AI soạn riêng cho đúng tình huống của bạn.

Easy Instruct là một **MCP server**. Khi một AI agent (Claude Code, Cursor, Copilot, Codex…) cần *dạy* bạn thay vì chỉ trả lời bằng chữ, nó bật một **lớp phủ toàn màn hình**:

- làm mờ màn hình và tô sáng đúng vùng cần chú ý bằng viền phát sáng;
- hiện bong bóng giải thích ngay cạnh: phần này là gì, dùng để làm gì, bạn cần làm gì;
- bạn bấm **Tiếp** hoặc tự thao tác; AI quan sát kết quả, giải thích lỗi nếu có, rồi dẫn tiếp cho tới khi bạn đạt mục tiêu.

## Nguyên tắc

- **AI là não, Easy Instruct là tay và mắt.** Easy Instruct chỉ hiển thị, định vị và quan sát. Việc hiểu code và soạn bài là của agent.
- **Bạn tự làm mọi thao tác.** AI chỉ chỉ ra vùng cần click hay terminal cần gõ lệnh, không bao giờ làm thay.
- **Không bao giờ kẹt.** Nếu không định vị được mục tiêu trên màn hình, bong bóng vẫn hiện kèm mô tả bằng chữ.
- **Chạy local.** Không theo dõi bàn phím; ảnh chụp chỉ nằm trong bộ nhớ.

## Có thể nhờ agent dạy gì

Easy Instruct không gắn với một loại bài học nào. Nó chỉ là tay và mắt của agent: tô sáng, giải thích, rồi quan sát xem bạn làm đúng chưa. Agent biết làm gì trong VS Code thì có thể dạy bạn tự làm việc đó.

| Bạn muốn | Ví dụ câu nói với agent |
|---|---|
| Hiểu một repo vừa clone | "Dạy mình repo này chạy thế nào" |
| Dùng Git bằng giao diện | "Chỉ mình commit và push bằng Source Control", "Hướng dẫn mình chuyển sang nhánh main" |
| Chạy lệnh trong terminal | "Hướng dẫn mình cài dependency rồi chạy test", "Lệnh này báo lỗi, chỉ mình sửa" |
| Học một tính năng của VS Code | "Dạy mình dùng debugger", "Chỉ mình tìm và thay thế trong cả project" |
| Làm một việc nhiều bước | "Hướng dẫn mình tạo pull request", "Chỉ mình tạo file mới rồi import nó vào `main.py`" |
| Hiểu một đoạn code | "Giải thích file này cho mình", "Hàm này được gọi từ đâu?" |

Bài học tốt đến đâu phụ thuộc vào agent: agent hiểu việc cần làm càng rõ thì các bước càng sát với tình huống của bạn.

**Giới hạn hiện tại:** chỉ VS Code trên Windows. Vùng sáng tự tìm được phần giao diện, chữ và dòng code trong VS Code; khi bạn chuyển sang ứng dụng khác, overlay tự ẩn. Hỗ trợ trình duyệt (Chrome) đang được lên kế hoạch.

## Cài đặt

Yêu cầu: Windows 10/11, Node.js 20 trở lên, VS Code.

```bash
npm install -g easy-instruct
easy-instruct doctor
```

`npm install` tự tải Electron cho lớp phủ. `doctor` kiểm tra máy (helper, OCR, VS Code, overlay), in từng mục `[ ok ]` / `[warn]` / `[FAIL]` kèm cách sửa, và thoát với mã 1 nếu có mục chặn bài học. Thêm `--json` cho agent đọc, `--no-overlay` để không bật Electron.

`[warn] win-helper.exe` là bình thường khi Smart App Control bật: helper PowerShell sẽ chạy thay (xem mục bên dưới).

### Cấu hình cho agent

Sau khi cài global, lệnh `easy-instruct` chạy MCP server qua stdio. Agent nào cũng cần trỏ tới lệnh này.

**Claude Code** (plugin gồm MCP server và skill `easy-instruct`, skill dạy Claude cách soạn bài và xử lý lỗi):

```bash
claude plugin marketplace add "<đường dẫn npm root -g>/easy-instruct"
claude plugin install easy-instruct@easy-instruct
```

Chạy `npm root -g` để lấy đường dẫn thư mục global của npm. Mở phiên Claude Code mới rồi nói kiểu "dạy mình repo này". Gỡ: `claude plugin uninstall easy-instruct@easy-instruct`.

**Claude Code chỉ MCP, không có skill:**

```bash
claude mcp add -s user easy-instruct -- easy-instruct
```

**Cursor** (`~/.cursor/mcp.json`) và **Claude Desktop** (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "easy-instruct": { "command": "easy-instruct" }
  }
}
```

**VS Code Copilot** (`.vscode/mcp.json` hoặc lệnh *MCP: Open User Configuration*):

```json
{
  "servers": {
    "easy-instruct": { "type": "stdio", "command": "easy-instruct" }
  }
}
```

**Codex** (`~/.codex/config.toml`):

```toml
[mcp_servers.easy-instruct]
command = "easy-instruct"
```

Agent không có skill vẫn nhận đủ hướng dẫn: tóm tắt lúc kết nối (MCP `instructions`), toàn bộ skill ở resources `easy-instruct://guide/...`, và prompts `explore_repo`, `explain_file`, `run_project`.

### Cài từ mã nguồn (để phát triển)

```bash
git clone https://github.com/Prosperum26/Easy_Instruct.git
cd Easy_Instruct
npm install              # tải Electron và build server, overlay, win-helper
npm run doctor
```

Khi cài từ clone, server chạy ở `node <clone>/dist/server/index.js`. Plugin Claude Code chạy ngay trong thư mục clone, nên sau `git pull` và `npm run build` chỉ cần mở phiên mới (hoặc `/reload-plugins`).

## MCP tools

| Tool | Tác dụng |
|---|---|
| `start_session` | Bật overlay, hiện thẻ giới thiệu |
| `show_step` | Hiện một bước: vùng sáng và bong bóng (`read` / `click` / `do`) |
| `show_card` | Hiện thẻ ở giữa màn hình |
| `wait_for_user` | Chờ người dùng: Tiếp, Xong, Bỏ qua, click trúng vùng sáng (`clicked`), Hỏi, Thoát, hoặc timeout |
| `end_session` | Thẻ tổng kết, tắt overlay khi người dùng đóng |
| `observe` | Chụp cửa sổ VS Code, toàn màn hình hoặc một vùng, kèm lưới tọa độ, gửi ảnh cho agent |
| `open_location` | Mở file đúng dòng trong VS Code (qua CLI của VS Code) |

Vùng sáng (`targets` của `show_step`, tối đa 3) có thể **mô tả** thay vì đưa tọa độ:

| Target | Ví dụ | Cách định vị |
|---|---|---|
| `ui` | `{ kind: "ui", element: "terminal" }` | UI Automation. Các phần có sẵn: `editor`, `status_bar`, `activity_bar`, `sidebar`, `panel`, `terminal`, `tabs`, `active_tab`, và các view `explorer` / `search` / `run_debug` / `source_control` / `extensions` |
| `text` | `{ kind: "text", text: "README.md", within: "explorer" }` | Tên trong UI Automation trước, OCR sau; bỏ dấu, chấp nhận lỗi OCR nhỏ; `occurrence` để chọn lần xuất hiện thứ n |
| `lines` | `{ kind: "lines", file: "src/app.py", start: 12, end: 30 }` | Mở file đúng dòng bằng CLI của VS Code, OCR cột số dòng (bỏ sticky scroll, xử lý dòng wrap, CodeLens, code bị fold) |

Mỗi vùng tìm được trả `method` (`uia` / `ocr` / `ocr_gutter` / `explicit`) và `confidence`. Không tìm được thì vùng đó vào `unresolved` kèm lý do (`not_visible`, `text_not_found`, `line_not_visible`, `line_numbers_hidden`, `file_not_found`…). `verify: true` trả thêm ảnh khu vực đó có vẽ khung để agent tự kiểm tra.

Khi không mô tả được, vùng sáng nhận `{ kind: "rect", x, y, w, h }`:

- `space: "screen"` (mặc định): pixel vật lý của màn hình chính, đọc từ nhãn lưới trên ảnh `observe`.
- `space: "screenshot"` + `screenshot_id`: pixel trên ảnh `observe` (đã thu nhỏ); server tự quy đổi.

Vùng lấn ra ngoài màn hình được cắt bớt. Vùng nằm hẳn ngoài màn hình hoặc ảnh không còn trong bộ nhớ được báo trong `unresolved`, và bước được hiện dạng thẻ. Overlay không xuất hiện trong ảnh chụp (content protection), nên cũng không hiện khi quay hoặc chia sẻ màn hình.

## Trong lúc học

- **Bước `click`**: bấm vào vùng sáng là tự sang bước (nút *Bỏ qua* vẫn còn). Chỉ trong bước này helper mới đọc trạng thái nút chuột chính và vị trí con trỏ, không đọc bàn phím.
- **Di chuyển hoặc đổi kích thước VS Code**: vùng sáng tự đi theo sau khi cửa sổ đứng yên khoảng 1 giây.
- **Sang app khác** (hoặc thu nhỏ VS Code): overlay tự ẩn, quay lại VS Code là hiện lại. Khi AI đưa ra bước mới, VS Code được đưa lên trước.
- **Đã cuộn editor hoặc đổi tab** mà vùng sáng lệch: bấm `Ctrl+Alt+R` để định vị lại.

Phím tắt: `Ctrl+Alt+H` ẩn/hiện lớp phủ, `Ctrl+Alt+R` định vị lại, `Ctrl+Alt+Q` thoát.

## win-helper và Smart App Control

Windows 11 có thể bật **Smart App Control**, chặn `win-helper.exe` vì file chưa được ký số. Server tự xử lý: thử exe trước, nếu không chạy được thì dùng `host.ps1` (cùng mã C#, chạy trong `powershell.exe` đã được Microsoft ký). Ép một cách cụ thể bằng `EASY_INSTRUCT_HELPER=dotnet` hoặc `EASY_INSTRUCT_HELPER=powershell`.

## Yêu cầu

- Windows 10/11
- Node.js 20 trở lên
- Windows PowerShell 5.1 (có sẵn trong Windows) cho win-helper
- VS Code (không cần lệnh `code` trong PATH: server tự tìm CLI cạnh `Code.exe`)
- OCR của Windows (có sẵn). Máy chỉ có gói tiếng Anh thì chữ tiếng Việt được tìm qua tên UI Automation; OCR dùng cho số dòng, tên file và chữ không dấu.
- Tùy chọn: .NET 10 SDK để build `win-helper.exe` và chạy test C#

## Phát triển

```bash
npm run build
npm test                 # unit và contract test
npm run test:helper      # test C# của win-helper (cần .NET SDK)
npm run typecheck
npm run overlay:demo     # demo các bước (đọc, click, thực hành, nhiều vùng sáng)
npm run overlay:demo -- --step=4              # mở thẳng bước 4
npm run overlay:demo -- --rect=100,200,600,80 # tô sáng đúng tọa độ pixel vật lý để kiểm tra DPI
```

Đặt `EASY_INSTRUCT_DEBUG=1` để xem log; thêm `--capture=out.png` để overlay tự chụp phần nó vẽ rồi thoát.

### Kiến trúc

```
AI Agent ──MCP stdio──▶ MCP Server (TypeScript) ──WebSocket──▶ Overlay (Electron)
                              │
                              └──JSON-lines──▶ win-helper (C#: tìm cửa sổ, chụp màn hình, focus)
                                                 ├─ win-helper.exe (.NET 10), hoặc
                                                 └─ host.ps1 (cùng mã C#, biên dịch bởi Windows PowerShell)
```

| Thư mục | Vai trò |
|---|---|
| `src/server` | MCP tools và prompts, điều phối |
| `src/session` | State machine của một bài học |
| `src/locator` | Biến mục tiêu (file + dòng, panel, chữ…) thành tọa độ trên màn hình |
| `src/observer` | Chụp màn hình gửi cho agent |
| `src/ide` | Gọi CLI của IDE (`code -g file:line`) |
| `src/helper-client` | Client giao tiếp với win-helper |
| `src/shared` | Kiểu dữ liệu, chuyển đổi tọa độ và DPI |
| `overlay/` | Ứng dụng Electron vẽ lớp phủ |
| `native/win-helper/` | Mã C# gọi API Windows, chạy dạng exe .NET 10 hoặc qua PowerShell |
| `skills/easy-instruct/` | Skill dạy AI cách dùng Easy Instruct: quy trình, chọn target, xử lý lỗi, các flow, bài học mẫu |
| `evals/` | Kịch bản kiểm thử hành vi của agent (`claude plugin eval`, MCP giả lập) |
| `.claude-plugin/`, `.mcp.json` | Đóng gói thành Claude Code plugin |
| `config/` | Bảng ánh xạ UI của VS Code |

## Giấy phép

Easy Instruct dùng [PolyForm Noncommercial License 1.0.0](LICENSE). Bạn được dùng, sửa và chia sẻ miễn phí cho mục đích **phi thương mại** (cá nhân, học tập, nghiên cứu, tổ chức phi lợi nhuận…). Dùng cho mục đích thương mại cần liên hệ tác giả để xin giấy phép riêng.
