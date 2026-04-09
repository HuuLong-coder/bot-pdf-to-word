#!/usr/bin/env node
/**
 * Setup script to create auth2.json for personal email mode
 * Chỉ cần chạy script này 1 lần để lưu session cho email cá nhân
 * Lần sau, fill_form_personal.js sẽ dùng auth2.json có sẵn
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const AUTH_FILE = path.join(__dirname, 'auth2.json');

async function waitForEnter(msg) {
  process.stdout.write(msg);
  return new Promise((resolve) => {
    const stdin = process.stdin;
    stdin.resume();
    stdin.setEncoding('utf8');
    stdin.once('data', () => { stdin.pause(); resolve(); });
  });
}

function isSignedInPageTitle(title) {
  return !String(title || '').toLowerCase().includes('sign in');
}

async function setupAuth2() {
  console.log('=== Setup Auth2.json - Google Account Login ===\n');
  console.log('Script này sẽ mở trình duyệt để bạn đăng nhập Google.');
  console.log('Đăng nhập xong, nhấn ENTER ở đây để lưu session vào auth2.json\n');

  const browser = await chromium.launch({
    headless: false,
    slowMo: 50,
    channel: 'chrome',
    args: [
      '--disable-blink-features=AutomationControlled',
      '--disable-web-resources',
      '--disable-extensions'
    ]
  });

  try {
    // Check if auth2.json exists
    if (fs.existsSync(AUTH_FILE)) {
      console.log(`✓ auth2.json đã tồn tại: ${AUTH_FILE}`);
      console.log('  Bạn không cần setup lại. Chạy: node fill_form_personal.js\n');
      return;
    }

    // Create fresh context (no saved state)
    const context = await browser.newContext();
    
    // Add stealth script to hide automation detection
    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
    });
    
    const page = await context.newPage();

    // Navigate to Google Account
    console.log('Đang mở Google Account...');
    await page.goto('https://myaccount.google.com', { waitUntil: 'networkidle', timeout: 20000 });

    // Check if already signed in
    const signedIn = await page.evaluate(() => {
      const hasLoginLink = !!document.querySelector('a[href*="ServiceLogin"]');
      return !hasLoginLink;
    });

    if (!signedIn || !isSignedInPageTitle(await page.title())) {
      console.log('Chưa đăng nhập - mở trang login...\n');
      await page.goto('https://accounts.google.com', { waitUntil: 'networkidle', timeout: 20000 });
    }

    console.log('✓ Trình duyệt đã mở.\n');
    console.log('📌 HƯỚNG DẪN:');
    console.log('   1. Hãy đăng nhập Google Account (email cá nhân hoặc tài khoản nào bạn muốn)');
    console.log('   2. Đăng nhập xong, quay lại cửa sổ Terminal này');
    console.log('   3. Nhấn ENTER để lưu session\n');

    await waitForEnter('> ');

    console.log('\n✓ Đang lưu session...');
    await context.storageState({ path: AUTH_FILE });
    console.log(`✓ Đã tạo auth2.json: ${AUTH_FILE}`);
    console.log('✓ Từ giờ chạy: node fill_form_personal.js\n');

    await context.close();
  } catch (err) {
    console.error('\n⚠ Lỗi:', err.message);
    throw err;
  } finally {
    try {
      await browser.close();
    } catch {}
  }
}

setupAuth2().catch((err) => {
  console.error('❌ Setup thất bại:', err);
  process.exit(1);
});
