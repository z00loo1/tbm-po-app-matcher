# PO-to-Application Matching: Interactive Proof of Concept

This is a **working browser demo** of candidate recommendations for purchase orders missing application IDs. It uses **fictional** data. The matcher is a transparent rules-and-similarity baseline, **not** a calibrated ML model.

**Live demo:** https://z00loo1.github.io/tbm-po-app-matcher/

> ⚠️ **Public demo, fictional data only.** GitHub Pages sites are publicly reachable even when the repository is private. This deployment is **not** an approved environment for confidential corporate data. Uploaded CSVs are read only inside your browser tab (a Content-Security-Policy blocks all network calls), but treat this as a demo.

## Use it on iPhone (Safari)

1. Open the live demo link. It starts with **embedded sample results** (badge: `DEMO DATA`).
2. To get test files onto your phone, tap the four sample links under **Data sources** (they download to *Files → Downloads*). Use `po_lines_modified_demo.csv` to see results change.
3. Tap **Choose CSV file** under each of the three boxes. The iOS Files picker opens; pick the matching CSV. A green ✓ and record count confirms each file was read and validated. If headers are wrong, a message lists the missing and found columns.
4. When all three show ✓, tap **Run matching**. A confirmation shows counts (with the modified demo PO file: **26 POs, 18 missing App IDs, 15 strong candidates**) and the badge changes to `YOUR DATA · MATCHED`.
5. Tap a PO row. On a phone the page scrolls to **Match evidence & review**, which shows up to three ranked candidates with score, supporting evidence, **conflicting evidence** and review status.
6. Tap **Approve** or **Reject candidate**. A short confirmation appears. Approvals are local to this session; nothing is written back to any source.
7. Tap **Export review CSV**. Safari offers to download `po_application_match_review_uploaded.csv` (or `_sample.csv`); it lands in *Files → Downloads*.
8. **Use sample data** discards uploaded data and restores the demo.

### Replacing the sample CSVs with your own files
You don't change anything in the repository. In the app, pick your own three CSVs in the three boxes and tap **Run matching**; they replace the sample results for that browser tab only. Reloading the page or tapping **Use sample data** returns to the demo. Excel/Numbers files must be exported as **CSV UTF-8** first. Do **not** commit real PO/APM exports to this repo (`.gitignore` blocks `*.csv` outside `samples/`).

To change the *demo* data everyone sees, edit the files in `samples/` **and** the `SAMPLES` object embedded in `index.html` (the page uses the embedded copy so it works offline), keeping them fictional.

## Run locally
Open `index.html` directly, or serve the folder: `python3 -m http.server 8000` → http://localhost:8000.

## Deployment
`.github/workflows/pages.yml` runs on every push to `main`: it runs the Playwright tests, then publishes only `index.html` and `samples/` to GitHub Pages. There is no build step and the app has no runtime dependencies (Node/Playwright are used for tests only).

## Tests
`npm install && npx playwright install chromium && npx playwright test` runs `tests/app.spec.js` against a local server in an iPhone-13-sized Chromium and desktop Chromium. `npm run test:live` runs the same tests against the published site. Covered: page load, sample links, parsing all three CSVs, header validation errors, Run matching, ranked candidates for missing IDs, known IDs unchanged, approve/reject/undo, CSV export contents, no console errors, no requests to other hosts, no horizontal scroll and ≥40px touch targets on phone. Real iOS Safari (WebKit) is not automated here — do a manual pass on the phone.

## Updating with GitHub Copilot or Claude
- **Small changes:** open the repo on github.com (or github.dev / Codespaces) and ask Copilot, or ask Claude with the repo connected, e.g. *"In index.html, add a column to the export for … Keep matching scores unchanged and run the Playwright tests."* Commit to `main`; the workflow tests and redeploys in ~2 minutes. Check the **Actions** tab for a green run.
- **Guardrails to include in prompts:** keep it a single static `index.html` with no external scripts or network calls (the CSP will block them anyway), never commit real data, preserve "never overwrite existing App IDs / never auto-approve", and keep the tests passing. If you change scoring, update the expected counts in `tests/app.spec.js` deliberately.
- `COPILOT_BUILD_BRIEF.md` describes the longer-term productionization path.

## Input file schemas

**`po_lines.csv`** — one row per PO line:

| Column | Required? | Meaning |
|---|---|---|
| `po_line_id` | Yes | Stable unique PO line ID; `po_number` is also supported as a fallback |
| `vendor_name` | Recommended | Vendor or supplier name |
| `po_title` | Yes | PO title |
| `line_description` | Recommended | Free-text PO line description |
| `existing_application_id` | Required header for the intended use; blank values allowed | Already-verified application ID when populated |

The input parser also recognizes `app_id` or `application_id` as the PO ID field and `description` as the PO description. To avoid collapsing separate PO lines, use `po_line_id` rather than a shared `po_number` whenever possible.

**`apm_applications.csv`** — one row per application:

| Column | Required? | Meaning |
|---|---|---|
| `application_id` | Yes | Authoritative APM App ID |
| `application_name` | Yes | Official application name |
| `known_aliases` | Recommended | Alternative names, separated with `|` or `;` |
| `vendor_name` | Recommended | One or more vendor names, separated with `|` or `;` |
| `application_description` | Optional | Description of the application |

**`apm_software_products.csv`** — one row per product-to-application association:

| Column | Required? | Meaning |
|---|---|---|
| `application_id` | Yes | The App ID the software product is associated with |
| `product_name` | Yes | Software product name |
| `alternate_names` | Recommended | Product aliases, separated with `|` or `;` |
| `publisher` | Recommended | Publisher/vendor aliases, separated with `|` or `;` |
| `product_description` | Optional | Product description |

**Important:** This PoC requires each software-product row to include an `application_id`. If your software-product export has only a `software_id`, you need to join a verified software-to-application relationship table first. The older generic TBM intake template's `software_products.csv` does **not** carry this relationship by itself.

If a software product has multiple legitimate App IDs, repeat its product row for each App ID; the app will show them as separate candidates. If that reflects a shared product, identifying the product is **not** sufficient to designate an application owner, so review before approval.

### CSV handling

- Save as UTF-8 CSV with a header row.
- Optional aliases/vendors must use `|` or `;` inside a field (not comma separators).
- The parser handles embedded commas and quoted CSV values.
- Empty App IDs remain missing; known App IDs are never rewritten.
- Rows with software products but no App ID are flagged and ignored, not guessed.

## Actual matching logic in this demo

1. Group APM application and software-product names, aliases, and vendors under each **App ID**.
2. For each missing-ID PO, compare its title and description against names and aliases using token and phrase matching (plus limited typo tolerance).
3. Check whether the PO vendor corroborates the APM publisher/vendor.
4. Compare the text with PO records that already have a *valid, verified* App ID to provide corroborating evidence. Known IDs are not modified.
5. Calculate a heuristic match-strength score, rank candidates, and require manual approval.
6. Explain each candidate: supporting evidence (exact application/product name, alias, fuzzy match, description, vendor agreement, similar verified PO) and conflicting evidence (vendor/publisher differs, close runner-up within 12 points, description-only match). These labels do not change the score.

Starting feature weights: **title match 72%, description match 12%, vendor corroboration 10%, previously mapped PO similarity 6%**. Vendor conflicts reduce scores. A "Strong match" requires a score >= 80, a margin >= 12 points over the runner-up, strong title evidence, and no vendor conflict. These thresholds are deliberately adjustable, **not learned or calibrated**. Similarity scores are not posterior probabilities.

Cases included: familiar vendor aliases, exact software/product matches, known-PO corroboration, ambiguous Microsoft renewals, no match, and a reseller PO where the vendor differs from the software publisher.

## Files and outputs

- `index.html` — complete HTML/CSS/JavaScript app; all data stays in the browser.
- `samples/po_lines.csv` — 25 fictional PO lines: 8 with known App IDs, 17 missing (same as the embedded demo).
- `samples/po_lines_modified_demo.csv` — the same plus one extra PO, to prove uploads are processed.
- `samples/apm_applications.csv` — 15 fictional applications with aliases/vendors/App IDs.
- `samples/apm_software_products.csv` — 14 product-to-application associations.
- `tests/app.spec.js`, `playwright.config.js`, `package.json` — automated tests (not deployed).
- `.github/workflows/pages.yml` — test + GitHub Pages deployment.
- `COPILOT_BUILD_BRIEF.md` — requirements for an internal, production-grade version.

The exported review CSV contains the original App ID, top suggestion, match score, review status, approved App ID, final App ID, rejected App IDs, top 3 candidates, supporting evidence, conflicting evidence, and whether the data was sample or uploaded. Source CSVs are not changed.

## Important limitations for production

- Uses hand-built lexical matching. Embeddings, phonetic/synonym libraries, model training, calibration, and a matching-service backend are **not** included.
- Similar titles can create false matches; the strong-match status is not permission to automate an authoritative financial allocation.
- Historical labeled POs are used as reference examples; validate on a **held-out** set when developing a trained model. If an ID is not actually verified, it should not be used for training.
- Vendor name is supporting evidence, not proof of ownership. Resellers, centralized licensing, and shared platforms need special handling.
- A row identified as a software *product* may still not establish a unique application relationship. APM completeness and relationship semantics determine quality.
- To support large volumes, move matching to Python/SQL (DuckDB, RapidFuzz, scikit-learn, sentence embeddings) and preserve audit trails, approver identity, model version, and review history.
- CSVs are processed only in the running browser. Do not paste real confidential procurement data into unapproved AI coding prompts or repositories.
