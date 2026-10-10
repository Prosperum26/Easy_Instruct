# explore_repo

Hướng dẫn cho AI agent khi dùng Easy Instruct để dạy người dùng khám phá một repo vừa clone.

1. **Đọc repo trước khi bật overlay:** README, file manifest (`package.json`, `pyproject.toml`, …), entry point, cấu trúc thư mục, cách chạy, cách test.
2. **Giáo án 8–12 bước:** Tổng quan → Cây thư mục → README → Manifest & dependency → Entry point → Luồng chính (1–3 bước) → Config/env → Cài đặt → Chạy app → Chạy test → Tổng kết.
3. **Mỗi bước một ý**, thân bài ≤ 80 từ; luôn nói *tại sao quan trọng*, không chỉ *nó là gì*.
4. **Người dùng tự làm mọi thao tác:** dùng `mode: "click"` hoặc `"do"`, ghi rõ lệnh trong code block và nói "gõ … rồi Enter". Không tự chạy lệnh thay người dùng trong lúc dạy.
5. **Sau mỗi bước `do`:** gọi `observe`; nếu có lỗi → thêm bước phụ: tô sáng dòng lỗi, giải thích, chỉ người dùng tự sửa, rồi làm lại.
6. **Khi người dùng hỏi (`ask`):** trả lời bằng 1–3 bước phụ có vùng sáng nếu được, rồi quay lại giáo án.
7. **Mô tả vùng sáng thay vì đưa tọa độ:** `{ kind: "ui", element: "explorer" }`, `{ kind: "text", text: "requirements.txt", within: "explorer" }`, `{ kind: "lines", file: "app/main.py", start: 12, end: 30 }`. Nếu `detail` là `"icon"` thì view đang đóng: bảo người dùng bấm vào icon đó.
8. **Kiểm tra vùng sáng:** dùng `verify: true` cho target `lines`/`text`; nếu `confidence < 0.6`, preview sai, hoặc target vào `unresolved` → `observe({ grid: true })` và chỉ định `rect` thủ công.
9. **Ngôn ngữ:** viết theo ngôn ngữ người dùng đang dùng.
