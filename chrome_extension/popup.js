const DEFAULT_API_URL = "http://127.0.0.1:8000/convert";

const dropzone = document.getElementById("dropzone");
const fileInput = document.getElementById("fileInput");
const convertBtn = document.getElementById("convertBtn");
const statusEl = document.getElementById("status");

let selectedFile = null;
let apiUrl = DEFAULT_API_URL;

function setStatus(message, type = "") {
  statusEl.textContent = message;
  statusEl.className = "status";
  if (type) {
    statusEl.classList.add(type);
  }
}

function setSelectedFile(file) {
  if (!file) {
    selectedFile = null;
    convertBtn.disabled = true;
    setStatus("Chua co file nao duoc chon.");
    return;
  }

  if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
    selectedFile = null;
    convertBtn.disabled = true;
    setStatus("Vui long chon dung file PDF.", "error");
    return;
  }

  selectedFile = file;
  convertBtn.disabled = false;
  setStatus(`Da chon: ${file.name}`);
}

async function convertFile() {
  if (!selectedFile) {
    setStatus("Ban chua chon file PDF.", "error");
    return;
  }

  convertBtn.disabled = true;
  setStatus("Dang convert... vui long doi.");

  try {
    if (!apiUrl) {
      throw new Error("Chua cau hinh API URL. Vao Extension options de cai dat.");
    }

    const formData = new FormData();
    formData.append("file", selectedFile, selectedFile.name);

    const response = await fetch(apiUrl, {
      method: "POST",
      body: formData
    });

    if (!response.ok) {
      let errorText = `Convert that bai (${response.status})`;
      try {
        const errJson = await response.json();
        if (errJson && errJson.detail) {
          errorText = errJson.detail;
        }
      } catch (_ignored) {
        // Keep default message when non-JSON response is returned.
      }
      throw new Error(errorText);
    }

    const blob = await response.blob();
    const filename = selectedFile.name.replace(/\.pdf$/i, ".docx");
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);

    setStatus("Convert thanh cong. File Word da duoc tai xuong.", "ok");
  } catch (error) {
    setStatus(`Loi: ${error.message}`, "error");
  } finally {
    convertBtn.disabled = false;
  }
}

["dragenter", "dragover"].forEach((eventName) => {
  dropzone.addEventListener(eventName, (event) => {
    event.preventDefault();
    event.stopPropagation();
    dropzone.classList.add("dragover");
  });
});

["dragleave", "drop"].forEach((eventName) => {
  dropzone.addEventListener(eventName, (event) => {
    event.preventDefault();
    event.stopPropagation();
    dropzone.classList.remove("dragover");
  });
});

dropzone.addEventListener("drop", (event) => {
  const file = event.dataTransfer?.files?.[0] || null;
  setSelectedFile(file);
});

fileInput.addEventListener("change", (event) => {
  const file = event.target.files?.[0] || null;
  setSelectedFile(file);
});

convertBtn.addEventListener("click", convertFile);

async function initSettings() {
  const stored = await chrome.storage.sync.get({ apiUrl: DEFAULT_API_URL });
  apiUrl = stored.apiUrl;
}

initSettings();
