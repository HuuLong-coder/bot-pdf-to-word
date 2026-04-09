import os
from pathlib import Path
import shutil
import tempfile

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from starlette.background import BackgroundTask

from converse import pdf_to_word

app = FastAPI(title="PDF to Word API", version="1.0.0")

allowed_origins_raw = os.getenv(
    "ALLOWED_ORIGINS",
    "http://127.0.0.1:8000,http://localhost:8000",
)
allowed_origins = [origin.strip() for origin in allowed_origins_raw.split(",") if origin.strip()]
conversion_engine = os.getenv("CONVERSION_ENGINE", "layout").strip().lower()

# Set ALLOWED_ORIGINS for production, for example:
# ALLOWED_ORIGINS=https://your-site.com,chrome-extension://<your-extension-id>
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/convert")
async def convert(file: UploadFile = File(...)):
    if not file.filename:
        raise HTTPException(status_code=400, detail="Khong co ten file.")

    filename = Path(file.filename).name
    if not filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Chi ho tro file .pdf")

    tmpdir = Path(tempfile.mkdtemp(prefix="pdf2docx_"))
    input_path = tmpdir / filename
    output_path = input_path.with_suffix(".docx")

    content = await file.read()
    input_path.write_bytes(content)

    try:
        pdf_to_word(
            input_path,
            output_path,
            title="Converted from PDF",
            engine=conversion_engine,
        )
    except Exception as exc:  # noqa: BLE001
        shutil.rmtree(tmpdir, ignore_errors=True)
        raise HTTPException(status_code=500, detail=f"Convert that bai: {exc}")

    return FileResponse(
        path=str(output_path),
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        filename=output_path.name,
        background=BackgroundTask(shutil.rmtree, str(tmpdir), True),
    )
