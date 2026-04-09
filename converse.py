import argparse
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

import pdfplumber
from docx import Document


@dataclass
class ConversionResult:
    pages_total: int
    pages_with_text: int
    output_path: Path


def _normalize_lines(text: str) -> list[str]:
    """Làm sạch dữ liệu text để ghi ra Word dễ đọc hơn."""
    lines: list[str] = []
    for raw_line in text.splitlines():
        line = " ".join(raw_line.split())
        if line:
            lines.append(line)
    return lines


def pdf_to_word(
    pdf_path: str | Path,
    docx_path: str | Path,
    *,
    title: str = "Nội dung chuyển từ PDF",
    add_page_headings: bool = True,
) -> ConversionResult:
    """
    Chuyển nội dung text từ PDF sang Word (.docx).

    - Trích xuất text theo từng trang.
    - Làm sạch khoảng trắng dư để tài liệu dễ đọc hơn.
    - Giữ bố cục cơ bản theo dòng.
    """

    pdf_file = Path(pdf_path)
    if not pdf_file.exists():
        raise FileNotFoundError(f"Không tìm thấy file PDF: {pdf_path}")
    if pdf_file.suffix.lower() != ".pdf":
        raise ValueError(f"File đầu vào không phải PDF: {pdf_path}")

    output_file = Path(docx_path)
    if output_file.suffix.lower() != ".docx":
        raise ValueError(f"File đầu ra phải có đuôi .docx: {docx_path}")
    output_file.parent.mkdir(parents=True, exist_ok=True)

    doc = Document()
    if title:
        doc.add_heading(title, level=1)

    pages_with_text = 0

    with pdfplumber.open(str(pdf_file)) as pdf:
        if not pdf.pages:
            raise ValueError("File PDF không có trang nào.")

        for i, page in enumerate(pdf.pages, start=1):
            text = page.extract_text()

            if add_page_headings:
                doc.add_heading(f"Trang {i}", level=2)

            if text and text.strip():
                pages_with_text += 1
                lines = _normalize_lines(text)
                for line in lines:
                    doc.add_paragraph(line)
            else:
                doc.add_paragraph("[Không trích xuất được nội dung ở trang này]")

            # Thêm ngắt trang nếu chưa phải trang cuối
            if i < len(pdf.pages):
                doc.add_page_break()

    doc.save(str(output_file))
    return ConversionResult(
        pages_total=len(pdf.pages),
        pages_with_text=pages_with_text,
        output_path=output_file,
    )


def _build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Chuyển nội dung text từ PDF sang Word (.docx) bằng pdfplumber + python-docx"
    )
    parser.add_argument("pdf_input", help="Đường dẫn file PDF đầu vào")
    parser.add_argument(
        "-o",
        "--output",
        dest="word_output",
        default=None,
        help="Đường dẫn file Word đầu ra (.docx). Mặc định: cùng tên với file PDF",
    )
    parser.add_argument(
        "--title",
        default="Nội dung chuyển từ PDF",
        help="Tiêu đề chính của tài liệu Word",
    )
    parser.add_argument(
        "--no-page-headings",
        action="store_true",
        help="Tắt heading theo từng trang",
    )
    return parser


def main(argv: Optional[list[str]] = None) -> int:
    parser = _build_arg_parser()
    args = parser.parse_args(argv)

    pdf_input = Path(args.pdf_input)
    word_output = (
        Path(args.word_output)
        if args.word_output
        else pdf_input.with_suffix(".docx")
    )

    try:
        result = pdf_to_word(
            pdf_path=pdf_input,
            docx_path=word_output,
            title=args.title,
            add_page_headings=not args.no_page_headings,
        )
        print(
            "Chuyển đổi thành công | "
            f"Tổng trang: {result.pages_total} | "
            f"Trang có text: {result.pages_with_text} | "
            f"Output: {result.output_path}"
        )
        return 0
    except Exception as exc:
        print(f"Lỗi: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())