// End-to-end checks for the PO → Application matching PoC.
// Uses only the fictional CSVs in samples/.
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const S = f => path.join(__dirname, '..', 'samples', f);
const BASE = new URL(process.env.BASE_URL || 'http://127.0.0.1:4173/').origin;

// Minimal CSV parser for reading the export back.
function parseCSV(text) {
  const rows = []; let row = [], cell = '', q = false;
  text = text.replace(/^﻿/, '');
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') { if (q && text[i + 1] === '"') { cell += '"'; i++; } else q = !q; }
    else if (c === ',' && !q) { row.push(cell); cell = ''; }
    else if ((c === '\n' || c === '\r') && !q) { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  row.push(cell); if (row.some(Boolean)) rows.push(row);
  const head = rows.shift();
  return rows.map(r => Object.fromEntries(head.map((h, i) => [h, r[i]])));
}

let consoleErrors, foreignRequests;
test.beforeEach(async ({ page }) => {
  consoleErrors = []; foreignRequests = [];
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', e => consoleErrors.push(String(e)));
  page.on('request', r => { const u = r.url(); if (!u.startsWith(BASE) && !u.startsWith('blob:') && !u.startsWith('data:')) foreignRequests.push(u); });
  await page.goto('./');
});
test.afterEach(async () => {
  expect(consoleErrors, 'browser console errors').toEqual([]);
  expect(foreignRequests, 'requests to other hosts').toEqual([]);
});

async function upload(page, po = 'po_lines_modified_demo.csv') {
  await page.setInputFiles('#po-file', S(po));
  await page.setInputFiles('#apps-file', S('apm_applications.csv'));
  await page.setInputFiles('#products-file', S('apm_software_products.csv'));
}

test('loads with clearly-labelled sample data', async ({ page }) => {
  await expect(page).toHaveTitle(/PO to Application/);
  await expect(page.locator('#source-label')).toHaveText('DEMO DATA');
  await expect(page.locator('#metrics .value').first()).toHaveText('25');
  await expect(page.locator('#run')).toBeDisabled();
});

test('sample CSV download links are served', async ({ page, request }) => {
  for (const href of await page.locator('#samples a').evaluateAll(as => as.map(a => a.getAttribute('href')))) {
    const res = await request.get(href);
    expect(res.status(), href).toBe(200);
    expect((await res.text()).split('\n')[0]).toContain('application_id');
  }
});

test('all three CSVs parse and Run matching updates results', async ({ page }) => {
  await upload(page);
  for (const id of ['po', 'apps', 'products']) await expect(page.locator(`#${id}-filename`)).toContainText('✓');
  await expect(page.locator('#po-filename')).toContainText('26 records');
  await expect(page.locator('#import-status')).toContainText('All 3 files validated');
  await expect(page.locator('#run')).toBeEnabled();
  await page.click('#run');
  await expect(page.locator('#import-status')).toContainText('26 POs analyzed, 18 missing App IDs, 15 strong');
  await expect(page.locator('#source-label')).toHaveText('YOUR DATA · MATCHED');
  await expect(page.locator('#metrics .value').nth(0)).toHaveText('26');
  await expect(page.locator('#po-rows tr[data-id="PO-3001"]')).toBeVisible();
});

test('missing IDs get ranked candidates; known IDs stay unchanged', async ({ page }) => {
  await upload(page); await page.click('#run');
  const rows = await page.evaluate(() => TBMPOC.compute().rows.map(r => ({ id: r.id, known: r.known, orig: r.po.existing_application_id, status: r.status, scores: r.candidates.map(c => c.score), top: r.candidates[0] && r.candidates[0].id })));
  const known = rows.filter(r => r.orig), missing = rows.filter(r => !r.orig);
  expect(known.length).toBe(8); expect(missing.length).toBe(18);
  for (const r of known) { expect(r.known).toBe(r.orig); expect(r.status).toBe('known'); }
  for (const r of missing) { expect(r.scores.length).toBeGreaterThan(0); expect([...r.scores].sort((a, b) => b - a)).toEqual(r.scores); expect(['strong', 'review', 'unresolved']).toContain(r.status); }
  expect(rows.find(r => r.id === 'PO-2001').top).toBe('APP-100');
  expect(rows.find(r => r.id === 'PO-3001').top).toBe('APP-105');
  // Reseller PO: vendor conflict is surfaced and it is NOT marked strong
  await page.locator('tr[data-id="PO-2017"]').click();
  await expect(page.locator('#detail .why.conflicts').first()).toContainText('CDW');
  expect(rows.find(r => r.id === 'PO-2017').status).toBe('review');
  // Known PO detail shows the existing relationship, no approve buttons
  await page.click('.tab[data-view="all"]');
  await page.locator('tr[data-id="PO-1001"]').click();
  await expect(page.locator('#detail')).toContainText('already has APP-100');
  await expect(page.locator('#detail [data-act="approve"]')).toHaveCount(0);
});

test('approve, reject, undo and export CSV', async ({ page }) => {
  await upload(page); await page.click('#run');
  await page.locator('tr[data-id="PO-2001"]').click();
  await expect(page.locator('#detail .candidate').first()).toContainText('Pending review');
  await page.click('#detail [data-act="approve"][data-app="APP-100"]');
  await expect(page.locator('#detail')).toContainText('Approved locally');
  await expect(page.locator('#toast')).toContainText('Approved APP-100 for PO-2001');
  await page.click('#detail [data-act="clear"]');
  await expect(page.locator('#detail')).not.toContainText('Approved locally');
  await page.click('#detail [data-act="approve"][data-app="APP-100"]');

  await page.locator('tr[data-id="PO-2017"]').click();
  const first = await page.locator('#detail [data-act="reject"]').first().getAttribute('data-app');
  await page.locator('#detail [data-act="reject"]').first().click();
  await expect(page.locator('#detail')).toContainText('Rejected candidates: ' + first);
  await expect(page.locator(`#detail [data-act="approve"][data-app="${first}"]`)).toHaveCount(0);

  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#export')]);
  expect(dl.suggestedFilename()).toBe('po_application_match_review_uploaded.csv');
  const rows = parseCSV(fs.readFileSync(await dl.path(), 'utf8'));
  expect(rows.length).toBe(26);
  const r1 = rows.find(r => r.po_line_id === 'PO-2001');
  expect(r1.approved_app_id).toBe('APP-100'); expect(r1.final_app_id).toBe('APP-100'); expect(r1.original_app_id).toBe('');
  expect(rows.find(r => r.po_line_id === 'PO-2017').rejected_app_ids).toBe(first);
  const k = rows.find(r => r.po_line_id === 'PO-1003'); expect(k.final_app_id).toBe('APP-102'); expect(k.original_app_id).toBe('APP-102');
  expect(rows.filter(r => !r.original_app_id && r.final_app_id).length).toBe(1); // nothing auto-assigned
  expect(rows.every(r => r.data_source === 'uploaded')).toBe(true);
});

test('wrong or invalid files show clear header errors', async ({ page }) => {
  await page.setInputFiles('#po-file', S('apm_applications.csv'));
  await expect(page.locator('#import-feedback')).toBeVisible();
  await expect(page.locator('#import-feedback')).toContainText('Missing required column');
  await expect(page.locator('#import-feedback')).toContainText('Columns found: application_id');
  await page.setInputFiles('#apps-file', { name: 'apps.xlsx', mimeType: 'application/octet-stream', buffer: Buffer.from('PK..') });
  await expect(page.locator('#import-feedback')).toContainText('spreadsheet, not a CSV');
  await page.setInputFiles('#products-file', S('apm_software_products.csv'));
  await expect(page.locator('#run')).toBeDisabled();
  await page.click('#reset');
  await expect(page.locator('#source-label')).toHaveText('DEMO DATA');
});

test('phone layout: no horizontal scroll, touch-sized controls', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'phone only');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  for (const sel of ['#reset', '#export', '#run', '.choose-file', '.tab']) {
    const h = await page.locator(sel).first().evaluate(e => e.getBoundingClientRect().height);
    expect(h, sel).toBeGreaterThanOrEqual(40);
  }
  expect(await page.locator('#search').evaluate(e => parseFloat(getComputedStyle(e).fontSize))).toBeGreaterThanOrEqual(16); // avoids iOS zoom-on-focus
  await upload(page); await page.click('#run');
  await page.locator('tr[data-id="PO-2005"]').click();
  await expect(page.locator('#detail [data-act="approve"]').first()).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  await page.screenshot({ path: test.info().outputPath('iphone-detail.png') });
});
