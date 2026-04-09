// fill_form.js
// Tự động đọc đáp án từ form đã làm, sau đó điền vào form trống cùng cấu trúc.
// Hỗ trợ form nhiều trang (Next button).
// Yêu cầu: npm install playwright && npx playwright install chromium
//
// Cách dùng:  node fill_form.js

const { chromium } = require('playwright');

const SCORE_URL =
  'https://docs.google.com/forms/d/e/1FAIpQLScqvauGgAUrM_dFBOvAWqrKMUg-tF7MMaspDD6kj0rf7Fnfow/viewscore?viewscore=AE0zAgAOzXZWUMs1udpUXwU99G2ML051SwD6DJ9P7LFDbPjuQFzU0GhabzrRpRIS4g&fbclid=IwY2xjawQ2HI1leHRuA2FlbQIxMABicmlkETFBYVVhdHlMNXhoUndpTHhOc3J0YwZhcHBfaWQQMjIyMDM5MTc4ODIwMDg5MgABHu7qie9tmpe2IWoPnH6getG1vn5r45iI1vYGYvC205tPHdLTz6DAVd9P_CrG_aem_2hHl2AMi35g-UICKoDfYFA';
const FORM_URL =
  'https://forms.gle/RUnvGA4K31nrktGh8';

function parseCliArgs(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const idx = a.indexOf('=');
    if (idx > -1) {
      const k = a.slice(2, idx).trim();
      const v = a.slice(idx + 1).trim();
      out[k] = v;
    } else {
      out[a.slice(2).trim()] = true;
    }
  }
  return out;
}

const CLI_ARGS = parseCliArgs(process.argv);
const PERSONAL_EMAIL_FROM_ARGS = (CLI_ARGS.email || process.env.FORM_EMAIL || '').trim();

// ── Helpers ────────────────────────────────────────────────────────────────────
function normalize(s) {
  return (s || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function normalizeTitleKey(s) {
  return normalize(s)
    .replace(/\*/g, '')
    .replace(/#\s*lưu\s*ý:.*/i, '')
    .replace(/["“”'`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeChoiceText(s) {
  return normalize(s)
    .replace(/^[a-z]\s*[\.|\)]\s*/i, '')
    .replace(/^đáp án\s*/i, '')
    .trim();
}

function buildAnswerIndex(answers) {
  const map = new Map();
  for (const ans of answers || []) {
    if (!ans || !ans.title) continue;
    if (!hasAnswerValue(ans)) continue;
    map.set(normalizeTitleKey(ans.title), ans);
  }
  return map;
}

async function waitForEnter(msg) {
  process.stdout.write(msg);
  return new Promise((resolve) => {
    const stdin = process.stdin;
    stdin.resume();
    stdin.setEncoding('utf8');
    stdin.once('data', () => { stdin.pause(); resolve(); });
  });
}

async function promptInput(msg) {
  process.stdout.write(msg);
  return new Promise((resolve) => {
    const stdin = process.stdin;
    stdin.resume();
    stdin.setEncoding('utf8');
    stdin.once('data', (data) => {
      stdin.pause();
      resolve(String(data || '').trim());
    });
  });
}

function hasAnswerValue(ans) {
  if (!ans) return false;
  if (Array.isArray(ans.value)) return ans.value.length > 0;
  if (ans.type === 'grid' && ans.value && typeof ans.value === 'object') {
    return Object.keys(ans.value).length > 0;
  }
  return !!String(ans.value || '').trim();
}

function answerQualityScore(ans) {
  let score = 0;
  if (ans.type && ans.type !== 'unknown') score += 3;
  if (hasAnswerValue(ans)) score += 6;
  if (ans.type === 'text') score += 1;
  if (ans.type === 'radio' || ans.type === 'dropdown') score += 2;
  if (ans.type === 'checkbox' || ans.type === 'grid') score += 2;
  return score;
}

function extractCrosswordToken(title, rawText) {
  const t = normalize(title);
  if (!/hàng ngang|hàng dọc|ô chữ/.test(t)) return null;

  // Đây là câu hướng dẫn (không phải ô cần điền đáp án), bỏ qua để tránh lấy nhầm "HOA" từ ví dụ "HOAVAN (Hoa văn)".
  if (/hãy truy tìm hàng dọc đặc biệt cùng chúng mình/i.test(String(title || ''))) {
    return null;
  }

  const lines = String(rawText || '')
    .split('\n')
    .map((x) => x.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  // Pattern: "Đáp án đúng: XXX" / "Correct answer: XXX"
  for (const line of lines) {
    const m = line.match(/(?:đáp\s*án\s*đúng|câu\s*trả\s*lời\s*đúng|correct\s*answer)\s*[:\-]?\s*([A-Z0-9]{3,})/i);
    if (m && m[1]) return m[1].toUpperCase();
  }

  // Pattern thực tế của viewscore: "... 0/1 ABC Correct answers XYZ"
  // Nếu có "Correct answers" thì luôn ưu tiên token ngay sau cụm này.
  {
    const joined = lines.join(' ');
    const m = joined.match(/correct\s*answers\s+([A-Z0-9]{3,})/i);
    if (m && m[1]) return m[1].toUpperCase();
  }

  // Pattern thực tế của viewscore: "... 1/1 TOKEN"
  // Lấy token sau điểm nếu có.
  for (const line of lines) {
    const m = line.match(/\b[01]\s*\/\s*1\s+([A-Z0-9]{3,})\b/i);
    if (m && m[1]) return m[1].toUpperCase();
  }

  // Ưu tiên token IN HOA không dấu, dạng đáp án ô chữ.
  for (const line of lines) {
    if (/^\*+$/.test(line)) continue;
    if (/điểm|points?/i.test(line)) continue;
    if (/^hàng ngang|^hàng dọc|^bộ ô chữ/i.test(line)) continue;
    const m = line.match(/\b[A-Z0-9]{3,}\b/g);
    if (m && m.length > 0) {
      const blacklist = new Set(['MSSV', 'TDTU', 'HOAVAN']);
      const cleaned = m.map((x) => x.toUpperCase()).filter((x) => !blacklist.has(x));
      const candidate = cleaned.sort((a, b) => b.length - a.length)[0];
      if (candidate && candidate.length >= 3) return candidate;
    }
  }

  return null;
}

function extractCorrectChoiceFromRaw(rawText) {
  const text = String(rawText || '').replace(/\u00a0/g, ' ');
  if (!text) return null;

  const m = text.match(/(?:Correct\s*answers?|Correct\s*answer|Đáp\s*án\s*đúng)\s*[:\-]?\s*([^\n]+)/i);
  if (!m || !m[1]) return null;

  let val = m[1].replace(/\s+/g, ' ').trim();
  if (!val) return null;

  // Nếu Google render lặp đôi cùng một chuỗi, co lại còn 1 lần.
  const rep = val.match(/^(.+?)\s+\1$/i);
  if (rep && rep[1]) val = rep[1].trim();

  // Cắt các phần rác thường gặp sau đáp án.
  val = val.replace(/\s+\d+\s*\/\s*\d+.*$/i, '').trim();
  return val || null;
}

function pickBetterAnswer(a, b) {
  // Merge cho checkbox/grid nếu cùng loại.
  if (a.type === 'checkbox' && b.type === 'checkbox') {
    const merged = [...new Set([...(a.value || []), ...(b.value || [])].filter(Boolean))];
    return { ...a, value: merged };
  }
  if (a.type === 'grid' && b.type === 'grid') {
    return { ...a, value: { ...(a.value || {}), ...(b.value || {}) } };
  }

  const sa = answerQualityScore(a);
  const sb = answerQualityScore(b);
  if (sb > sa) return b;
  if (sa > sb) return a;

  const lenA = Array.isArray(a.value) ? a.value.join(' ').length : JSON.stringify(a.value || '').length;
  const lenB = Array.isArray(b.value) ? b.value.join(' ').length : JSON.stringify(b.value || '').length;
  return lenB > lenA ? b : a;
}

function postProcessAnswers(rawAnswers) {
  const filtered = [];

  for (const ans of rawAnswers) {
    const title = String(ans.title || '').trim();
    if (!title) continue;

    // Bỏ các dòng điểm/section title không phải câu cần điền.
    if (!hasAnswerValue(ans) && /\b\d+\s+of\s+\d+\s+points\b/i.test(title)) {
      continue;
    }

    let candidate = { ...ans, title };

    // Nếu unknown nhưng là ô chữ, cố parse token từ rawText.
    if ((!hasAnswerValue(candidate) || candidate.type === 'unknown') && candidate.rawText) {
      const token = extractCrosswordToken(candidate.title, candidate.rawText);
      if (token) {
        candidate = { ...candidate, type: 'text', value: token, parsedFrom: 'crossword-token' };
      }
    }

    // Với câu trắc nghiệm, nếu viewscore có "Correct answer", ưu tiên dùng đáp án đúng này.
    if (candidate.rawText && !/hàng ngang|hàng dọc|ô chữ/i.test(normalize(candidate.title))) {
      const correctChoice = extractCorrectChoiceFromRaw(candidate.rawText);
      if (correctChoice) {
        candidate = {
          ...candidate,
          type: 'radio',
          value: correctChoice,
          parsedFrom: 'viewscore-correct-answer',
        };
      }
    }

    filtered.push(candidate);
  }

  // Dedupe theo title normalized.
  const map = new Map();
  for (const ans of filtered) {
    const key = normalize(ans.title);
    if (!map.has(key)) {
      map.set(key, ans);
      continue;
    }
    const existing = map.get(key);
    map.set(key, pickBetterAnswer(existing, ans));
  }

  return Array.from(map.values());
}

// ── Scrape đáp án từ trang viewscore ──────────────────────────────────────────
// Viewscore hiển thị tất cả câu hỏi trên 1 trang (không phân trang)
async function scrapeAnswers(page) {
  await page.goto(SCORE_URL, { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);

  // Nếu bị redirect qua login, cho user đăng nhập rồi thử lại.
  const needsLogin = page.url().includes('accounts.google.com');
  if (needsLogin) {
    await waitForEnter(
      '\n[BƯỚC ĐĂNG NHẬP VIEW SCORE] Link đáp án yêu cầu đăng nhập.\n' +
      'Đăng nhập đúng tài khoản có quyền xem đáp án, sau đó nhấn ENTER...\n> '
    );
    await page.goto(SCORE_URL, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2500);
  }

  const answers = await page.evaluate(() => {
    const norm = (s) => (s || '').replace(/\s+/g, ' ').trim();
    const results = [];

    const items = document.querySelectorAll('[data-item-id], div[role="listitem"], .Qr7Oae');

    items.forEach((item) => {
      const rawText = item.innerText || '';

      // Tiêu đề câu hỏi
      const titleEl = item.querySelector(
        '.freebirdFormviewerViewItemsItemItemTitle, [role="heading"], [class*="M7eMe"]'
      );
      const title = titleEl ? norm(titleEl.innerText) : null;
      if (!title) return;

      // ── Text / Short answer ──
      const textInput = item.querySelector(
        '.freebirdFormviewerViewItemsTextTextInput input, ' +
        '.freebirdFormviewerViewItemsTextShorttext input, ' +
        'input[type="text"]'
      );
      if (textInput) {
        const val = textInput.value || textInput.getAttribute('data-initial-value') || '';
        // Cũng thử lấy từ div hiển thị read-only
        const displayDiv = item.querySelector(
          '.freebirdFormviewerViewItemsTextTextResponse, ' +
          '.freebirdFormviewerViewItemsTextShortTextResponse'
        );
        const displayVal = displayDiv ? norm(displayDiv.innerText) : '';
        results.push({ title, type: 'text', value: val || displayVal, rawText });
        return;
      }

      // Textarea (paragraph)
      const textarea = item.querySelector('textarea');
      if (textarea) {
        results.push({ title, type: 'text', value: norm(textarea.value || textarea.innerText), rawText });
        return;
      }

      // ── Radio (single choice) ──
      // Trong viewscore, option được chọn thường có aria-checked=true HOẶC class isSelected
      const radioSelected =
        item.querySelector('[role="radio"][aria-checked="true"]') ||
        item.querySelector('.freebirdFormviewerViewItemsRadiogroupRadioLabel.isSelected') ||
        item.querySelector('.appsMaterialWizToggleRadiogroupEl[aria-checked="true"]');

      if (radioSelected) {
        // Lấy text label của option được chọn
        const labelText =
          radioSelected.querySelector('.freebirdFormviewerViewItemsRadiogroupRadioLabelText, .docssharedWizToggleLabeledLabelText')?.innerText ||
          radioSelected.closest('[data-value]')?.getAttribute('data-value') ||
          norm(radioSelected.innerText);
        results.push({ title, type: 'radio', value: norm(labelText), rawText });
        return;
      }

      // ── Checkbox (multi choice) ──
      const checkboxItems = item.querySelectorAll(
        '[role="checkbox"][aria-checked="true"], ' +
        '.freebirdFormviewerViewItemsCheckboxLabel.isSelected'
      );
      if (checkboxItems.length > 0) {
        const vals = Array.from(checkboxItems).map((el) => {
          return norm(
            el.querySelector('.freebirdFormviewerViewItemsCheckboxLabelText, .docssharedWizToggleLabeledLabelText')?.innerText ||
            el.closest('[data-value]')?.getAttribute('data-value') ||
            el.innerText
          );
        }).filter(Boolean);
        if (vals.length > 0) {
          results.push({ title, type: 'checkbox', value: vals, rawText });
          return;
        }
      }

      // ── Dropdown ──
      const dropdownSelected =
        item.querySelector('[aria-selected="true"]') ||
        item.querySelector('.freebirdFormviewerViewItemsSelectSelect option:checked');
      if (dropdownSelected) {
        const val = norm(
          dropdownSelected.getAttribute('data-value') ||
          dropdownSelected.value ||
          dropdownSelected.innerText
        );
        if (val && val !== 'choose') {
          results.push({ title, type: 'dropdown', value: val, rawText });
          return;
        }
      }

      // ── Grid / Matrix rows ──
      // Mỗi hàng trong grid xuất hiện như 1 sub-item dưới câu hỏi cha
      const gridRows = item.querySelectorAll(
        '.freebirdFormviewerViewItemsGridGridRow, [role="row"]'
      );
      if (gridRows.length > 0) {
        const rowAnswers = {};
        gridRows.forEach((row) => {
          const rowLabel = norm(row.querySelector('[role="rowheader"], .freebirdFormviewerViewItemsGridGridRowHeader')?.innerText || '');
          const selectedCell =
            row.querySelector('[role="radio"][aria-checked="true"]') ||
            row.querySelector('[role="checkbox"][aria-checked="true"]');
          if (rowLabel && selectedCell) {
            rowAnswers[rowLabel] = norm(
              selectedCell.getAttribute('data-value') ||
              selectedCell.closest('[data-value]')?.getAttribute('data-value') ||
              selectedCell.innerText
            );
          }
        });
        if (Object.keys(rowAnswers).length > 0) {
          results.push({ title, type: 'grid', value: rowAnswers, rawText });
          return;
        }
      }

      // Không nhận dạng được — push để debug/hậu xử lý.
      results.push({
        title,
        type: 'unknown',
        value: null,
        rawText,
      });
    });

    return results;
  });

  if (answers.length === 0) {
    console.log(`⚠ DEBUG scrape: url hiện tại = ${page.url()}`);
    console.log(`⚠ DEBUG scrape: title = ${await page.title()}`);
  }

  const processed = postProcessAnswers(answers);
  console.log(`✓ Hậu xử lý đáp án: raw=${answers.length}, dedupe=${processed.length}`);
  return processed;
}

// ── Tìm câu hỏi trên trang hiện tại theo title ────────────────────────────────
async function findQuestion(page, title) {
  return page.evaluateHandle((t) => {
    const normStr = (s) => (s || '').replace(/\s+/g, ' ').trim().toLowerCase();
    const isVisible = (el) => {
      if (!el) return false;
      const st = window.getComputedStyle(el);
      if (st.display === 'none' || st.visibility === 'hidden') return false;
      if (el.offsetParent === null) return false;
      let p = el;
      while (p) {
        if (p.getAttribute && p.getAttribute('aria-hidden') === 'true') return false;
        p = p.parentElement;
      }
      return true;
    };
    const clean = (s) =>
      normStr(s)
        .replace(/\*/g, '')
        .replace(/#\s*lưu\s*ý:.*/i, '')
        .replace(/["“”'`]/g, '')
        .replace(/\s+/g, ' ')
        .trim();

    const items = document.querySelectorAll('[data-item-id], div[role="listitem"], .Qr7Oae');
    const target = clean(t);

    for (const item of items) {
      if (!isVisible(item)) continue;
      const titleEl = item.querySelector(
        '.freebirdFormviewerViewItemsItemItemTitle, [role="heading"], [class*="M7eMe"]'
      );
      if (!titleEl) continue;
      const itemTitle = clean(titleEl.innerText);
      if (itemTitle === target) return item;
    }

    // Partial match fallback
    for (const item of items) {
      if (!isVisible(item)) continue;
      const titleEl = item.querySelector(
        '.freebirdFormviewerViewItemsItemItemTitle, [role="heading"], [class*="M7eMe"]'
      );
      if (!titleEl) continue;
      const itemTitle = clean(titleEl.innerText);
      if (itemTitle.includes(target) || target.includes(itemTitle)) return item;
    }

    // Token overlap fallback
    const targetTokens = target.split(' ').filter((x) => x.length >= 4);
    let bestItem = null;
    let bestScore = 0;
    for (const item of items) {
      if (!isVisible(item)) continue;
      const titleEl = item.querySelector(
        '.freebirdFormviewerViewItemsItemItemTitle, [role="heading"], [class*="M7eMe"]'
      );
      if (!titleEl) continue;
      const itemTitle = clean(titleEl.innerText);
      if (!itemTitle) continue;
      const itemTokens = new Set(itemTitle.split(' '));
      let overlap = 0;
      for (const tk of targetTokens) {
        if (itemTokens.has(tk)) overlap++;
      }
      if (overlap > bestScore) {
        bestScore = overlap;
        bestItem = item;
      }
    }
    if (bestItem && bestScore >= 3) {
      return bestItem;
    }

    return null;
  }, title);
}

// ── Điền 1 câu hỏi trên trang hiện tại ───────────────────────────────────────
async function fillAnswer(page, ans) {
  const item = await findQuestion(page, ans.title);
  const found = await item.evaluate((el) => !!el);
  if (!found) return false;

  // Text
  if (ans.type === 'text' && ans.value) {
    const inputs = await item.$$('input[type="text"], input[type="email"], input[type="number"], textarea');
    for (const inputEl of inputs) {
      const usable = await inputEl.evaluate((el) => {
        const st = window.getComputedStyle(el);
        const visible = st.display !== 'none' && st.visibility !== 'hidden' && el.offsetParent !== null;
        return visible && !el.disabled && !el.readOnly;
      });
      if (!usable) continue;
      await inputEl.click({ clickCount: 3 });
      await inputEl.fill(ans.value);
      console.log(`  ✓ Text: "${ans.value}"`);
      return true;
    }
    return false;
  }

  // Radio
  if (ans.type === 'radio' && ans.value) {
    const norm = (s) => (s || '').replace(/\s+/g, ' ').trim().toLowerCase();
    const targetNorm = norm(ans.value);
    const targetChoiceNorm = normalizeChoiceText(ans.value);

    // Thử tìm theo data-value
    const optByVal = await item.$(`[data-value="${ans.value}"]`);
    if (optByVal) {
      await optByVal.click();
      console.log(`  ✓ Radio (data-value): "${ans.value}"`);
      return true;
    }
    // Tìm theo text label
    const allOpts = await item.$$('[role="radio"], .freebirdFormviewerViewItemsRadiogroupRadioLabel');
    for (const opt of allOpts) {
      const txt = await opt.evaluate((el) => {
        const label = el.querySelector('.freebirdFormviewerViewItemsRadiogroupRadioLabelText, .docssharedWizToggleLabeledLabelText');
        return label ? label.innerText.trim() : el.innerText.trim();
      });
      const optionNorm = norm(txt);
      const optionChoiceNorm = normalizeChoiceText(txt);
      if (
        optionNorm === targetNorm ||
        optionChoiceNorm === targetChoiceNorm ||
        optionNorm.includes(targetNorm) ||
        targetNorm.includes(optionNorm) ||
        optionChoiceNorm.includes(targetChoiceNorm) ||
        targetChoiceNorm.includes(optionChoiceNorm)
      ) {
        await opt.click();
        console.log(`  ✓ Radio (text): "${txt}"`);
        return true;
      }
    }
    console.log(`  ⚠ Không tìm thấy option radio: "${ans.value}"`);
    return false;
  }

  // Checkbox
  if (ans.type === 'checkbox' && Array.isArray(ans.value) && ans.value.length > 0) {
    const norm = (s) => (s || '').replace(/\s+/g, ' ').trim().toLowerCase();
    for (const val of ans.value) {
      const optByVal = await item.$(`[data-value="${val}"]`);
      if (optByVal) {
        const checked = await optByVal.evaluate((el) => el.getAttribute('aria-checked') === 'true');
        if (!checked) await optByVal.click();
        console.log(`  ✓ Checkbox (data-value): "${val}"`);
        continue;
      }
      // Tìm theo text
      const allOpts = await item.$$('[role="checkbox"], .freebirdFormviewerViewItemsCheckboxLabel');
      for (const opt of allOpts) {
        const txt = await opt.evaluate((el) => {
          const label = el.querySelector('.freebirdFormviewerViewItemsCheckboxLabelText, .docssharedWizToggleLabeledLabelText');
          return label ? label.innerText.trim() : el.innerText.trim();
        });
        if (norm(txt) === norm(val)) {
          const checked = await opt.evaluate((el) => el.getAttribute('aria-checked') === 'true');
          if (!checked) await opt.click();
          console.log(`  ✓ Checkbox (text): "${txt}"`);
          break;
        }
      }
    }
    return true;
  }

  // Dropdown
  if (ans.type === 'dropdown' && ans.value) {
    const norm = (s) => (s || '').replace(/\s+/g, ' ').trim().toLowerCase();
    // Click để mở dropdown
    const ddTrigger = await item.$('[role="listbox"], .freebirdFormviewerViewItemsSelectSelect, select');
    if (ddTrigger) {
      const tagName = await ddTrigger.evaluate((el) => el.tagName.toLowerCase());
      if (tagName === 'select') {
        // Native select
        await ddTrigger.selectOption({ label: ans.value });
        console.log(`  ✓ Select: "${ans.value}"`);
        return true;
      } else {
        await ddTrigger.click();
        await page.waitForTimeout(600);
        // Tìm option trong popup
        const popup = page.locator('[role="option"], [role="listitem"]');
        const count = await popup.count();
        let filled = false;
        for (let i = 0; i < count; i++) {
          const txt = await popup.nth(i).innerText();
          if (norm(txt) === norm(ans.value)) {
            await popup.nth(i).click();
            console.log(`  ✓ Dropdown: "${txt}"`);
            filled = true;
            break;
          }
        }
        if (!filled) {
          // Thử data-value
          const optByVal = await page.$(`[data-value="${ans.value}"]`);
          if (optByVal) {
            await optByVal.click();
            console.log(`  ✓ Dropdown (data-value): "${ans.value}"`);
            return true;
          }
          await page.keyboard.press('Escape');
          console.log(`  ⚠ Không tìm thấy option dropdown: "${ans.value}"`);
          return false;
        }
        return true;
      }
    }
    return false;
  }

  // Grid
  if (ans.type === 'grid' && ans.value && typeof ans.value === 'object') {
    const norm = (s) => (s || '').replace(/\s+/g, ' ').trim().toLowerCase();
    const rows = await item.$$('.freebirdFormviewerViewItemsGridGridRow, [role="row"]');
    for (const row of rows) {
      const rowLabel = await row.evaluate((el) => {
        const h = el.querySelector('[role="rowheader"], .freebirdFormviewerViewItemsGridGridRowHeader');
        return h ? h.innerText.trim() : '';
      });
      if (!rowLabel) continue;
      const targetVal = Object.entries(ans.value).find(([k]) => norm(k) === norm(rowLabel))?.[1];
      if (!targetVal) continue;
      const cells = await row.$$('[role="radio"], [role="checkbox"]');
      for (const cell of cells) {
        const cellVal = await cell.evaluate((el) =>
          el.getAttribute('data-value') ||
          el.closest('[data-value]')?.getAttribute('data-value') || ''
        );
        if (norm(cellVal) === norm(targetVal)) {
          await cell.click();
          console.log(`  ✓ Grid "${rowLabel}" → "${cellVal}"`);
          break;
        }
      }
    }
    return true;
  }

  return false; // found but couldn't fill
}

async function autoFillPersonalEmail(page, personalEmail) {
  if (!personalEmail) return 0;

  let filled = 0;

  const directEmailInputs = page.locator(
    '.Qr7Oae input[type="email"], [data-item-id] input[type="email"], div[role="listitem"] input[type="email"]'
  );
  const emailCount = await directEmailInputs.count();
  for (let i = 0; i < emailCount; i++) {
    const inp = directEmailInputs.nth(i);
    const usable = await inp.evaluate((el) => {
      const st = window.getComputedStyle(el);
      const visible = st.display !== 'none' && st.visibility !== 'hidden' && el.offsetParent !== null;
      return visible && !el.disabled && !el.readOnly;
    }).catch(() => false);
    if (!usable) continue;
    const cur = await inp.inputValue().catch(() => '');
    if (String(cur || '').trim()) continue;
    await inp.fill(personalEmail);
    filled++;
  }

  // Fallback theo title chứa từ khóa email (nếu input type không phải email)
  const emailAns = { title: 'email', type: 'text', value: personalEmail };
  const matchedByTitle = await findQuestion(page, 'email');
  const found = await matchedByTitle.evaluate((el) => !!el);
  if (found) {
    const ok = await fillAnswer(page, emailAns);
    if (ok) filled++;
  }

  if (filled > 0) {
    console.log(`  ✓ Auto email: ${personalEmail} (${filled} ô)`);
  }

  return filled;
}

// ── Điền form trống — xử lý nhiều trang ───────────────────────────────────────
async function fillForm(page, answers, options = {}) {
  await page.goto(FORM_URL, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  const answerIndex = buildAnswerIndex(answers);
  const personalEmail = (options.personalEmail || '').trim();
  const manualPromptedPages = new Set();
  let pageNum = 1;

  while (true) {
    console.log(`\n════ Trang ${pageNum} của form ════`);

    const visibleQuestions = await page.evaluate(() => {
      const norm = (s) => (s || '').replace(/\s+/g, ' ').trim();
      const items = document.querySelectorAll('[data-item-id], div[role="listitem"], .Qr7Oae');
      const rows = [];
      items.forEach((item) => {
        const titleEl = item.querySelector(
          '.freebirdFormviewerViewItemsItemItemTitle, [role="heading"], [class*="M7eMe"]'
        );
        const title = titleEl ? norm(titleEl.innerText) : '';
        if (!title) return;
        rows.push({ title, required: /\*/.test(title) });
      });
      return rows;
    });

    // Auto-fill email cá nhân nếu form yêu cầu.
    await autoFillPersonalEmail(page, personalEmail);

    // Điền tất cả câu hỏi có trên trang này
    let filledCount = 0;
    for (const ans of answers) {
      if (!ans.title || !ans.value) continue;
      const valueEmpty = Array.isArray(ans.value) ? ans.value.length === 0
        : (ans.type === 'grid' ? Object.keys(ans.value || {}).length === 0 : !ans.value);
      if (valueEmpty) continue;

      console.log(`\n► "${ans.title}" [${ans.type}]`);
      const ok = await fillAnswer(page, ans);
      if (ok) {
        filledCount++;
      } else {
        console.log('  ⚠ Không match được câu này trên trang hiện tại.');
      }
    }
    console.log(`\n  → Đã xử lý ${filledCount} câu hỏi trên trang ${pageNum}`);

    // Nếu có câu bắt buộc mà không scan được đáp án, cho user điền tay rồi ENTER.
    const missingRequired = visibleQuestions
      .filter((q) => q.required)
      .filter((q) => !answerIndex.has(normalizeTitleKey(q.title)))
      .filter((q) => !(personalEmail && /\bemail\b|e-mail/i.test(q.title)))
      .map((q) => q.title);

    const pageSig = visibleQuestions.map((q) => normalizeTitleKey(q.title)).join('|');
    if (missingRequired.length > 0 && !manualPromptedPages.has(pageSig)) {
      manualPromptedPages.add(pageSig);
      console.log('\n  ⚠ Có câu bắt buộc chưa scan được đáp án.');
      for (const t of missingRequired) {
        console.log(`    - ${t}`);
      }
      await waitForEnter(
        '\n  [MANUAL] Bạn hãy điền tay các câu trên trang này, rồi nhấn ENTER để bot tiếp tục...\n> '
      );
    }

    // Kiểm tra nút Next
    const nextBtn = page.locator(
      'div[role="button"]:not([aria-disabled="true"])'
      ).filter({ hasText: /^(Next|Tiếp|Tiếp theo)$/i });

    const nextCount = await nextBtn.count();
    if (nextCount > 0) {
      console.log(`\n  → Click Next sang trang ${pageNum + 1}...`);
      await nextBtn.first().click();
      await page.waitForTimeout(2000); // đợi trang mới load
      pageNum++;
    } else {
      // Không còn Next — đã đến trang cuối
      console.log(`\n  → Không có nút Next. Đã điền xong ${pageNum} trang.`);
      break;
    }
  }
}

// ── Main ───────────────────────────────────────────────────────────────────────
// Dùng profile Chrome có sẵn — đã đăng nhập Google, không cần login lại.
// ⚠ Đóng Chrome trước khi chạy script.
const path = require('path');
const os = require('os');
const fs = require('fs');
const { execSync } = require('child_process');

// Đường dẫn user data Chrome trên Windows
// Nếu dùng profile khác đổi CHROME_PROFILE thành 'Profile 1', 'Profile 2'...
const CHROME_USER_DATA = path.join(os.homedir(), 'AppData', 'Local', 'Google', 'Chrome', 'User Data');
const CHROME_PROFILE   = 'Default';
const CHROME_PERSONAL_PROFILE_DEFAULT = (CLI_ARGS['personal-profile'] || 'Default').trim();
const AUTH_FILE = path.join(__dirname, 'auth.json');
const AUTH_FILE_PERSONAL = path.join(__dirname, 'auth2.json');

function listChromeProfiles() {
  const base = CHROME_USER_DATA;
  let names = [];
  try {
    names = fs.readdirSync(base, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .filter((name) => {
        const pref = path.join(base, name, 'Preferences');
        return fs.existsSync(pref);
      });
  } catch {
    return [];
  }

  // Ưu tiên các profile phổ biến lên đầu danh sách
  const score = (name) => {
    if (name === 'Default') return 100;
    if (/^Profile\s+\d+$/i.test(name)) return 80;
    if (/Guest|System Profile/i.test(name)) return -50;
    return 60;
  };

  return names.sort((a, b) => score(b) - score(a) || a.localeCompare(b));
}

async function chooseChromeProfileInteractive(defaultName) {
  const profiles = listChromeProfiles();
  if (profiles.length === 0) {
    console.log('⚠ Không đọc được danh sách Chrome profile, dùng giá trị bạn nhập tay.');
    const typed = await promptInput(`Nhập Chrome profile (mặc định: ${defaultName}):\n> `);
    return typed || defaultName;
  }

  console.log('Danh sách profile Chrome khả dụng:');
  profiles.forEach((name, i) => {
    console.log(`  ${i + 1}) ${name}`);
  });

  const typed = await promptInput(
    `Chọn số profile hoặc nhập tên profile (mặc định: ${defaultName}):\n> `
  );

  if (!typed) {
    return profiles.includes(defaultName) ? defaultName : profiles[0];
  }

  const idx = Number(typed);
  if (Number.isInteger(idx) && idx >= 1 && idx <= profiles.length) {
    return profiles[idx - 1];
  }

  // Nhập tên tay
  return typed;
}

function isSignedInPageTitle(title) {
  return !String(title || '').toLowerCase().includes('sign in');
}



async function openSessionContextWithAuthFile(authFilePath, modeLabel) {
  const browser = await chromium.launch({ headless: false, slowMo: 50, channel: 'chrome' });

  let context;
  if (fs.existsSync(authFilePath)) {
    context = await browser.newContext({ storageState: authFilePath });
  } else {
    context = await browser.newContext();
  }

  const page = await context.newPage();
  
  try {
    await page.goto('https://myaccount.google.com', { waitUntil: 'networkidle', timeout: 15000 });

    const signedIn = await page.evaluate(() => {
      const hasLoginLink = !!document.querySelector('a[href*="ServiceLogin"]');
      return !hasLoginLink;
    });

    if (!signedIn || !isSignedInPageTitle(await page.title())) {
      await page.goto('https://accounts.google.com', { waitUntil: 'networkidle', timeout: 15000 });
      await waitForEnter(
        '\n[BƯỚC ĐĂNG NHẬP AUTH2] Hãy đăng nhập Google trên cửa sổ vừa mở.\n' +
        '                        Đăng nhập xong nhấn ENTER để lưu auth2.json...\n> '
      );
      await context.storageState({ path: authFilePath });
      console.log(`✓ Đã lưu session vào ${path.basename(authFilePath)} cho chế độ ${modeLabel}.\n`);
    } else {
      console.log(`✓ Đăng nhập sẵn bằng session ${path.basename(authFilePath)} (${modeLabel}).\n`);
    }
  } catch (err) {
    console.error('⚠ Lỗi khi khởi động trình duyệt:', err.message);
    await browser.close();
    throw err;
  }

  return { context, page, mode: 'session', browser };
}

(async () => {
  console.log('=== Google Form Auto-Fill Personal ===\n');

  const selectedAuthFile = AUTH_FILE_PERSONAL;
  const selectedModeLabel = 'email cá nhân';

  let personalEmail = PERSONAL_EMAIL_FROM_ARGS;
  if (!personalEmail) {
    personalEmail = await promptInput('Nhập email cá nhân để auto-fill (ENTER để bỏ qua):\n> ');
  }

  console.log(`Đang chạy chế độ: ${selectedModeLabel}`);
  console.log(`Session file: ${path.basename(selectedAuthFile)} (file riêng cho email cá nhân)`);
  if (personalEmail) {
    console.log(`Email auto-fill: ${personalEmail}`);
  } else {
    console.log('Không cấu hình email auto-fill.');
  }

  const opened = await openSessionContextWithAuthFile(selectedAuthFile, selectedModeLabel);
  const { context, page } = opened;

  console.log('[BƯỚC 1] Đang đọc đáp án từ viewscore...');
  const answers = await scrapeAnswers(page);

  if (answers.length === 0) {
    console.log('⚠ Không scrape được đáp án nào. Bot sẽ chuyển sang chế độ hỗ trợ nhập tay.');
  }

  const autoCount = answers.filter((a) => hasAnswerValue(a)).length;
  console.log(`✓ Có ${autoCount}/${answers.length} câu có thể auto-fill.`);

  console.log(`\n✓ Đọc được ${answers.length} câu hỏi từ viewscore:`);
  answers.forEach((a, i) => {
    let val;
    if (a.type === 'grid') val = JSON.stringify(a.value);
    else if (Array.isArray(a.value)) val = a.value.join(', ');
    else val = a.value || '(trống)';
    console.log(`  ${i + 1}. [${a.type}] ${a.title}\n      → ${val}`);
  });

  await waitForEnter(
    '\n[BƯỚC 2] Nhấn ENTER để bắt đầu điền form trống...\n> '
  );

  console.log('\n[BƯỚC 2] Đang điền form...');
  await fillForm(page, answers, { personalEmail });

  console.log(
    '\n✅ Đã điền xong! Trình duyệt vẫn đang mở để bạn kiểm tra.\n' +
    '   Script KHÔNG tự submit — bạn tự kiểm tra rồi bấm "Gửi".\n' +
    '   Nhấn ENTER ở đây để kết thúc script (trình duyệt vẫn mở).\n'
  );
  await waitForEnter('> ');

  process.exit(0);
})();
