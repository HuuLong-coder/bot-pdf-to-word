# bot_clean — Safe cleaner for Windows C:\ drive (dry-run by default)

Tệp `bot_clean.js` là một script Node.js nhỏ giúp quét các file/folder có khả năng không cần thiết và có thể xóa được. Script chạy ở chế độ dry-run (không xóa) theo mặc định — chỉ xóa khi bạn chạy với cờ xác nhận.

Cảnh báo quan trọng
- KHÔNG chạy script ở chế độ xóa trên toàn bộ ổ C: trừ khi bạn hiểu rõ các đường dẫn và rủi ro.
- Script đã loại trừ một số thư mục hệ thống phổ biến (Windows, Program Files, ProgramData, System32) nhưng không thể đảm bảo an toàn hoàn toàn cho mọi cấu hình.
- Luôn chạy `--dry-run` trước, kiểm tra file log, rồi mới chạy với `--confirm --confirm-token=DELETE` nếu bạn chắc chắn.

Yêu cầu
- Node.js (12+)

Sử dụng nhanh

- Chạy dry-run (mặc định):

```powershell
node bot_clean.js --dry-run
```

- Quét các đường dẫn tùy chọn (phân tách bằng dấu `;`):

```powershell
node bot_clean.js --paths "C:\\Users\\Long\\Downloads;C:\\Users\\Long\\AppData\\Local\\Temp" --dry-run
```

- Thay đổi ngưỡng tuổi (ngày) và kích thước tối đa (MB):

```powershell
node bot_clean.js --age-days=60 --max-size-mb=200 --dry-run
```

- Khi bạn đã kiểm tra và muốn xóa thực sự (rất nguy hiểm):

```powershell
node bot_clean.js --confirm --confirm-token=DELETE --paths "C:\\Users\\Long\\Downloads" --age-days=60
```

Gợi ý an toàn
- Luôn kiểm tra file log (tên tệp `bot_clean_log_<timestamp>.json`) trước khi sửa đổi.
- Không cung cấp đường dẫn hệ thống (như `C:\Windows`) cho tùy chọn `--paths` trừ khi bạn biết mình làm gì.

Tiếp theo
- Nếu bạn muốn, tôi có thể: thêm chế độ interactive (hiển thị từng tệp và hỏi y/n), thêm whitelist từ config, hoặc xuất một báo cáo chi tiết hơn.

## PDF to Word miễn phí (converse.py)

Script `converse.py` dùng `pdfplumber` + `python-docx` để trích xuất text từ PDF sang file Word.

### Cài dependencies Python

```powershell
python -m pip install -r requirements.txt
```

### Chạy cơ bản

```powershell
python converse.py input.pdf
```

Mặc định output sẽ là file cùng tên, đuôi `.docx` (ví dụ `input.docx`).

### Chạy với output tùy chọn

```powershell
python converse.py input.pdf -o output.docx
```

### Tùy chọn nâng cao

```powershell
python converse.py input.pdf -o output.docx --title "Tai lieu chuyen doi" --no-page-headings
```

- `--title`: đổi tiêu đề chính trong tài liệu Word.
- `--no-page-headings`: tắt heading `Trang 1`, `Trang 2`, ...

## Chrome Extension: keo-tha PDF, tra ve Word

Da them bo mau gom:

- `chrome_extension/`: giao dien extension de user keo-tha PDF.
- `backend/api.py`: API nhan PDF, convert, tra lai `.docx`.

### 1) Cai dependencies

```powershell
python -m pip install -r requirements.txt
```

### 2) Chay backend API

```powershell
python -m uvicorn backend.api:app --host 127.0.0.1 --port 8000 --reload
```

API se mo tai `http://127.0.0.1:8000`.

### 3) Load extension vao Chrome

1. Mo `chrome://extensions`
2. Bat `Developer mode`
3. Bam `Load unpacked`
4. Chon thu muc `chrome_extension`

### 4) Su dung

1. Bam icon extension
2. Keo-tha file PDF vao popup (hoac bam chon file)
3. Bam `Convert`
4. Extension se goi API va tu dong tai file `.docx` ve may

### Luu y deploy

- Ban build hien tai dang goi API local (`127.0.0.1:8000`).
- Neu muon cho user cong khai, can deploy backend len server va doi `API_URL` trong `chrome_extension/popup.js`.

## Publish cho nguoi dung tai ve

De publish len Chrome Web Store va cho user tai extension cong khai, xem huong dan:

- `PUBLISH_CHROME_EXTENSION.md`

Ban extension hien tai da co trang Options de luu `API URL` (khong can hard-code trong popup).

## Deploy free len Render (khuyen dung)

Du an da co san file cau hinh:

- `render.yaml`
- `Procfile`

### Cac buoc deploy

1. Day code len GitHub.
2. Dang nhap Render va chon `New +` -> `Blueprint`.
3. Chon repo GitHub cua ban.
4. Render se doc `render.yaml` va tao service `pdf-to-word-api`.
5. Dat bien moi truong `ALLOWED_ORIGINS` trong Render:

```text
https://your-website.com,chrome-extension://<EXTENSION_ID>
```

Tam thoi khi chua co extension id, co the de:

```text
*
```

6. Deploy xong, ban se co URL dang:

```text
https://your-service-name.onrender.com
```

API convert se la:

```text
https://your-service-name.onrender.com/convert
```

### Noi extension vao API Render

1. Mo `chrome://extensions`.
2. Mo trang `Details` cua extension -> `Extension options`.
3. Nhap API URL:

```text
https://your-service-name.onrender.com/convert
```

4. Bam Save va test convert.

Luu y: goi free cua Render co the sleep khi it truy cap, request dau tien co the cham vai giay.
