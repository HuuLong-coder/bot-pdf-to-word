const DEFAULT_API_URL = "http://127.0.0.1:8000/convert";

const apiUrlInput = document.getElementById("apiUrl");
const saveBtn = document.getElementById("saveBtn");
const msg = document.getElementById("msg");

function setMessage(text, isError = false) {
  msg.textContent = text;
  msg.style.color = isError ? "#9f1d1d" : "#155724";
}

async function loadSettings() {
  const { apiUrl } = await chrome.storage.sync.get({ apiUrl: DEFAULT_API_URL });
  apiUrlInput.value = apiUrl;
}

async function saveSettings() {
  const apiUrl = apiUrlInput.value.trim();
  if (!apiUrl) {
    setMessage("API URL khong duoc de trong.", true);
    return;
  }

  try {
    const url = new URL(apiUrl);
    if (!url.pathname.endsWith("/convert")) {
      setMessage("API URL nen ket thuc bang /convert", true);
      return;
    }
  } catch (_error) {
    setMessage("API URL khong hop le.", true);
    return;
  }

  await chrome.storage.sync.set({ apiUrl });
  setMessage("Da luu cai dat API URL.");
}

saveBtn.addEventListener("click", saveSettings);
loadSettings();
