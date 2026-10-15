# Copilot Build Brief: Productionizing the PO to App ID Matcher

## Goal
Create a controlled, auditable process that recommends missing `application_id` values on software/application PO lines. Use PO title, description, vendor, and previously **verified** App IDs together with APM application and software-product names, aliases, vendors, and linked App IDs.

The enclosed `index.html` is a **working heuristic PoC**, not a production trained classifier. Retain the human-in-the-loop review behavior and explainability.

## Data contract
1. PO line grain: `po_line_id`. Fields: `vendor_name`, `po_title`, `line_description`, `existing_application_id` (nullable).
2. APM application grain: `application_id`. Fields: `application_name`, `known_aliases`, `vendor_name`, `application_description`.
3. APM product relationship grain: `application_id` + `product_name` (or separately versioned software-product ID). Fields: `alternate_names`, `publisher`, `product_description`.
4. Determine explicitly whether software-product-to-app is one-to-one, one-to-many, or many-to-many. Do not force a single App ID when evidence supports multiple associations.
5. Keep original PO App ID immutable. Record proposed, approved, and rejected App IDs separately, with source lineage.

## Matching design
### Baseline (already implemented)
- Normalize case, punctuation, legal vendor suffixes, whitespace, and aliases.
- Generate candidate App IDs from the APM application and product catalogs.
- Score title-to-alias, description-to-alias, vendor agreement, and text similarity with verified previously mapped POs.
- Penalize conflicts, show top candidates with evidence, and abstain on weak or ambiguous inputs.
- Never auto-approve.

### Recommended next steps
1. Add an approved vendor-alias table and product-identity normalization (Microsoft vs MSFT, Confluent brand, resellers).
2. Introduce candidate retrieval with TF-IDF and cosine similarity, plus RapidFuzz alias comparisons. Index catalog text for larger populations.
3. Add sentence embeddings from an *enterprise-approved* model only if validation shows improvement on genuine PO descriptions and abbreviations.
4. Add supervised re-ranking (logistic regression / gradient boosting) if enough verified positive and negative pairs exist; train with source-aware splits and calibrate scores.
5. Add business constraints, e.g. lifecycle status, active contract dates, business unit, product SKU, legal entity, owner, and acceptable relationship type.
6. Separate `identified_product`, `matched_application`, `relationship_type`, and `needs_review`. Support legitimate outcomes: multiple consumers, shared service, reseller, unknown.
7. Store reviewer decisions and reasons, with approved timestamps and model/version metadata. Do not treat all historic mappings as unquestioned ground truth.

## Acceptance criteria
- Top-1 App ID accuracy, top-3 recall, precision for approvals, no-match coverage, and false-positive rates evaluated against held-out verified mappings.
- Separate evaluation for single-product, reseller, generic PO text, software products mapped to multiple applications, and vendor-only descriptions.
- Never overwrite nonblank source IDs and never invent IDs outside the APM catalog.
- Matching result includes original App ID, proposed App ID, rank, matching evidence, signal scores, reviewer action, model version, and provenance.
- Original CSVs remain untouched. Export is injection-safe and appropriately sanitized.
- Use no unapproved cloud services and do not commit sensitive Ariba/APM exports to source control.

## Suggested next GitHub Copilot prompt

> Inspect `index.html` and the three sample CSVs. Preserve all existing file-upload, review, and export functionality. Refactor only the matching/scoring logic into a testable standalone module and add automated tests for identity normalization, token/alias similarity, vendor mismatch, shared software associated with multiple App IDs, weak ambiguous POs, and immutable known App IDs. Report the actual results of tests. Do not invent data or claim probability calibration. Propose a Python batch-matching engine only after the PoC's expected behaviors pass.
