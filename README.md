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
                              └──JSON-lines──▶ win-helper (C#: tìm cửa sổ, chụp màn hình, focus)
                                                 ├─ win-helper.exe (.NET 10), hoặc
                                                 └─ host.ps1 (cùng mã C#, biên dịch bởi Windows PowerShell)
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
| `native/win-helper/` | Mã C# gọi API Windows, chạy dạng exe .NET 10 hoặc qua PowerShell |
| `skills/easy-instruct/` | Skill dạy AI cách dùng Easy Instruct: quy trình, chọn target, xử lý lỗi, các flow, bài học mẫu |
| `evals/` | Kịch bản kiểm thử hành vi của agent (`claude plugin eval`, MCP giả lập) |
| `.claude-plugin/`, `.mcp.json` | Đóng gói thành Claude Code plugin |
| `config/` | Bảng ánh xạ UI của VS Code |

## MCP tools

| Tool | Tác dụng | Có từ |
|---|---|---|
| `start_session` | Bật overlay, hiện thẻ giới thiệu | M2 |
| `show_step` | Hiện một bước: vùng sáng + bong bóng (`read` / `click` / `do`) | M2 |
| `show_card` | Hiện thẻ ở giữa màn hình | M2 |
| `wait_for_user` | Chờ người dùng: Tiếp, Xong, Bỏ qua, click trúng vùng sáng (`clicked`), Hỏi, Thoát (hoặc timeout) | M2, M5 |
| `end_session` | Thẻ tổng kết, tắt overlay khi người dùng đóng | M2 |
| `observe` | Chụp cửa sổ VS Code / toàn màn hình / một vùng, kèm lưới tọa độ, gửi ảnh cho agent | M3 |
| `open_location` | Mở file đúng dòng trong VS Code (qua CLI của VS Code) | M4 |

Vùng sáng (`targets` của `show_step`, tối đa 3) có thể **mô tả** thay vì đưa tọa độ:

| Target | Ví dụ | Cách định vị |
|---|---|---|
| `ui` | `{ kind: "ui", element: "terminal" }` | UI Automation. Phần có sẵn: `editor`, `status_bar`, `activity_bar`, `sidebar`, `panel`, `terminal`, `tabs`, `active_tab`, và các view `explorer` / `search` / `run_debug` / `source_control` / `extensions` (view đang mở → cả sidebar; đang đóng → icon để bấm mở, `detail: "icon"`) |
| `text` | `{ kind: "text", text: "README.md", within: "explorer" }` | Tên trong UI Automation trước, OCR sau; bỏ dấu, chấp nhận lỗi OCR nhỏ; `occurrence` để chọn lần xuất hiện thứ n |
| `lines` | `{ kind: "lines", file: "src/app.py", start: 12, end: 30 }` | Mở file đúng dòng bằng CLI của VS Code, OCR cột số dòng (bỏ sticky scroll, xử lý dòng wrap/CodeLens, code bị fold) |

Mỗi vùng tìm được trả `method` (`uia` / `ocr` / `ocr_gutter` / `explicit`) và `confidence`; không tìm được thì vào `unresolved` kèm lý do (`not_visible`, `text_not_found`, `line_not_visible`, `line_numbers_hidden`, `file_not_found`…). `verify: true` trả thêm ảnh khu vực đó có vẽ khung để agent tự kiểm tra.

Khi không mô tả được, vùng sáng vẫn nhận `{ kind: "rect", x, y, w, h }`:

- `space: "screen"` (mặc định): pixel vật lý của màn hình chính, đọc thẳng từ nhãn lưới trên ảnh `observe`.
- `space: "screenshot"` + `screenshot_id`: pixel trên ảnh `observe` (đã thu nhỏ); server tự quy đổi.

Vùng lấn ra ngoài màn hình được cắt bớt; vùng nằm hẳn ngoài màn hình hoặc ảnh không còn trong bộ nhớ được báo trong `unresolved` và bước được hiện dạng thẻ. Overlay không bao giờ xuất hiện trong ảnh chụp (content protection), nên cũng không hiện khi quay/chia sẻ màn hình.

## Trạng thái

🚧 Đang phát triển.

- **M1** ✅ Overlay Electron: lớp mờ, vùng sáng, bong bóng.
- **M2** ✅ MCP server: session, Lùi/Tiếp cục bộ, hỏi đáp, kênh WebSocket tới overlay, tự khởi động lại overlay khi crash.
- **M3** ✅ `observe` cho agent, tìm cửa sổ VS Code theo workspace, trả focus về VS Code sau khi hỏi, win-helper chạy được cả khi Smart App Control bật.
- **M4** ✅ Tự định vị: phần giao diện VS Code (UI Automation), chữ (tên UIA hoặc OCR), dòng code (`open_location` + OCR số dòng); `verify` kèm ảnh preview.
- **M5** ✅ Bước `click` tự hoàn tất khi người dùng click trúng vùng sáng; vùng sáng đi theo cửa sổ VS Code khi nó di chuyển/đổi kích thước; overlay ẩn khi bạn sang app khác và hiện lại khi quay về; `Ctrl+Alt+R` định vị lại.
- **M5.5** ✅ Bộ skill `easy-instruct` + MCP instructions/resources/prompts + Claude Code plugin + bộ eval.
- **M6** ✅ `easy-instruct doctor` kiểm tra máy; `npm install` tự build; cài plugin từ bản clone; cấu hình cho các agent khác.

### Trong lúc học

- **Bước `click`**: bạn click vào vùng sáng là tự sang bước (nút *Bỏ qua* vẫn còn). Chỉ trong bước này helper mới đọc trạng thái nút chuột chính và vị trí con trỏ (không đọc bàn phím).
- **Di chuyển / đổi kích thước VS Code**: vùng sáng tự đi theo sau khi cửa sổ đứng yên khoảng 1 giây.
- **Sang app khác** (hoặc thu nhỏ VS Code): overlay tự ẩn, quay lại VS Code là hiện lại. Khi AI đưa ra bước mới, VS Code được đưa lên trước.
- **Đã cuộn editor hoặc đổi tab** mà vùng sáng lệch: bấm `Ctrl+Alt+R`.

## Cài đặt

Repo đang private nên cài từ bản clone. `npm install` tải Electron và build luôn (server, overlay, win-helper):

```bash
git clone https://github.com/Prosperum26/Easy_Instruct.git
cd Easy_Instruct
npm install
npm run doctor           # kiểm tra máy: helper, OCR, VS Code, overlay
```

`doctor` in từng mục `[ ok ]` / `[warn]` / `[FAIL]` kèm cách sửa, và thoát với mã 1 nếu có mục chặn bài học. `--json` cho agent đọc, `--no-overlay` để không bật Electron. `[warn] win-helper.exe` là bình thường khi Smart App Control bật: helper PowerShell chạy thay.

### Dùng với Claude Code (plugin: MCP server + skill)

```bash
claude plugin marketplace add <đường dẫn tới bản clone>
claude plugin install easy-instruct@easy-instruct
```

Mở phiên Claude Code mới (CLI hoặc extension VS Code) rồi nói kiểu "dạy mình repo này": skill `easy-instruct` cho Claude biết cách soạn bài, chọn vùng sáng và xử lý lỗi; MCP server mở overlay. Plugin chạy ngay trong thư mục clone, nên sau `git pull` / `npm run build` chỉ cần mở phiên mới (hoặc `/reload-plugins`). Gỡ: `claude plugin uninstall easy-instruct@easy-instruct`.

### Dùng với agent khác

Server là `node <clone>/dist/server/index.js` (stdio). Agent không có skill vẫn nhận đủ hướng dẫn: tóm tắt lúc kết nối (MCP `instructions`), toàn bộ skill ở resources `easy-instruct://guide/...`, và prompts `explore_repo`, `explain_file`, `run_project`. Thay `C:/path/to/Easy_Instruct` bằng chỗ bạn clone:

**Cursor** (`~/.cursor/mcp.json`) và **Claude Desktop** (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "easy-instruct": { "command": "node", "args": ["C:/path/to/Easy_Instruct/dist/server/index.js"] }
  }
}
```

**VS Code Copilot** (`.vscode/mcp.json` hoặc lệnh *MCP: Open User Configuration*):

```json
{
  "servers": {
    "easy-instruct": { "type": "stdio", "command": "node", "args": ["C:/path/to/Easy_Instruct/dist/server/index.js"] }
  }
}
```

**Codex** (`~/.codex/config.toml`):

```toml
[mcp_servers.easy-instruct]
command = "node"
args = ["C:/path/to/Easy_Instruct/dist/server/index.js"]
```

**Claude Code không dùng plugin** (chỉ MCP, không có skill): `claude mcp add -s user easy-instruct -- node C:/path/to/Easy_Instruct/dist/server/index.js`.

## Phát triển

```bash
npm run build
npm test                 # unit + contract test (Node)
npm run test:helper      # test C# của win-helper (cần .NET SDK)
npm run typecheck
npm run doctor
npm run overlay:demo     # demo các bước (đọc / click / thực hành / nhiều vùng sáng)
npm run overlay:demo -- --step=4              # mở thẳng bước 4
npm run overlay:demo -- --rect=100,200,600,80 # tô sáng đúng tọa độ pixel vật lý để kiểm tra DPI
```

Phím tắt: `Ctrl+Alt+H` ẩn/hiện lớp phủ, `Ctrl+Alt+R` định vị lại vùng sáng, `Ctrl+Alt+Q` thoát. Đặt `EASY_INSTRUCT_DEBUG=1` để xem log; thêm `--capture=out.png` để overlay tự chụp phần nó vẽ rồi thoát.

### Kiểm thử hành vi của agent

`evals/` chạy các kịch bản (dạy repo, lệnh bị lỗi, câu hỏi ngắn không nên mở overlay) với MCP giả lập. Mỗi lần chạy là lời gọi model thật, tính vào usage:

```bash
claude plugin eval . --scaffold --max-cost-usd 5
```

`test/guide/skill.test.ts` (chạy trong `npm test`) bảo đảm skill nhắc tới mọi mã lỗi, lý do `unresolved`, event và phần UI mà code có.

### win-helper và Smart App Control

Windows 11 có thể bật **Smart App Control**, chặn `win-helper.exe` vì file chưa được ký số. Server tự xử lý: thử exe trước, nếu không chạy được thì dùng `host.ps1` (cùng mã C#, chạy trong `powershell.exe` đã được Microsoft ký). Ép một cách cụ thể bằng `EASY_INSTRUCT_HELPER=dotnet` hoặc `EASY_INSTRUCT_HELPER=powershell`. Về lâu dài, ký số exe là cách chuẩn khi phát hành.

## Yêu cầu

- Windows 10/11
- Node.js ≥ 20
- Windows PowerShell 5.1 (có sẵn trong Windows) cho win-helper
- Tuỳ chọn: .NET 10 SDK để build `win-helper.exe` và chạy test C# (không có thì `npm install` bỏ qua exe, dùng helper PowerShell)
- VS Code (không cần lệnh `code` trong PATH: server tự tìm CLI cạnh `Code.exe`)
- OCR của Windows (có sẵn; máy chỉ có gói tiếng Anh thì chữ tiếng Việt được tìm qua tên UI Automation, OCR dùng cho số dòng, tên file, chữ không dấu)
