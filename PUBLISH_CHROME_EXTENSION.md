# Publish Chrome Extension + Public API

Muc tieu: user cai extension tu Chrome Web Store, keo PDF vao, nhan lai file DOCX de tai ve.

## 1) Deploy backend API (bat buoc)

Extension public KHONG the dung localhost. Ban can deploy API len HTTPS.

Goi y nen dung:
- Render
- Railway
- Fly.io
- Google Cloud Run

### Chay backend o production

```powershell
python -m pip install -r requirements.txt
python -m uvicorn backend.api:app --host 0.0.0.0 --port 8000
```

Dat bien moi truong CORS:

```text
ALLOWED_ORIGINS=https://your-frontend-domain.com,chrome-extension://<EXTENSION_ID>
```

Luu y:
- Sau khi extension duoc publish, ban se co `<EXTENSION_ID>` co dinh.
- Cap nhat CORS de chi cho phep domain can thiet.

## 2) Cau hinh extension dung API public

1. Load tam extension bang `Load unpacked`.
2. Mo trang options cua extension.
3. Dien API URL vi du:

```text
https://your-api-domain.com/convert
```

4. Bam Save.
5. Test convert 1 file PDF.

## 3) Dong goi extension de publish

Can co:
- icon 16x16, 48x48, 128x128 (khuyen nghi).
- screenshot UI.
- mo ta, danh muc, support email.
- Privacy Policy URL cong khai.

Sau do:
1. Zip toan bo noi dung thu muc `chrome_extension` (khong zip folder cha).
2. Vao Chrome Web Store Developer Dashboard.
3. Tao item moi va upload file zip.
4. Dien thong tin listing va gui review.

## 4) Privacy policy (rat quan trong)

Vì extension upload file PDF cua user len server, ban can noi ro:
- du lieu nao duoc gui len server
- du lieu duoc giu bao lau
- co ghi log hay khong
- co chia se ben thu 3 hay khong

Ban nen host privacy policy tren website, GitHub Pages, hoac Notion public.

## 5) Sau khi duoc duyet

1. Lay extension ID tu Chrome Web Store.
2. Cap nhat bien `ALLOWED_ORIGINS` tren backend them:

```text
chrome-extension://<EXTENSION_ID>
```

3. Restart backend.
4. Test lai ban publish tren Chrome Web Store.
