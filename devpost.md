# Devpost Submission Copy

## Project Title

LocalFirst — On-Device Medical & Receipt PII Redaction + Cloud Gemini Cross-Doc Audit

## Tagline

Redact medical & receipt PII on-device with Gemini Nano — even offline — and let cloud Gemini audit only the placeholders.

## Inspiration

Organizing hospital outpatient records, pharmacy receipts, and end-of-year medical reimbursement claims is painful and error-prone: patients have to verify totals, catch duplicate prescriptions, and check whether ineligible items snuck into a claim. Uploading raw medical records to a cloud LLM leaks names, national ID numbers, bank cards, insurance IDs, and home addresses—and fails completely when offline inside clinics or transit. On the other hand, lightweight on-device models excel at fast private single-document extraction, while deeper multi-document reconciliation benefits from a stronger cloud model.

LocalFirst was built to demonstrate why **Hybrid AI** is the right architecture for personal sensitive documents: keep raw PII strictly on-device, and send only consistent, numbered placeholders to the cloud when cross-document reasoning is genuinely needed.

## What it does

LocalFirst Privacy Workbench is a bilingual (Chinese/English) browser workbench primarily tailored for Mainland China medical records and reimbursement receipts—plus an English sample covering SSN, US phone numbers, emails, and addresses so international judges can try it immediately:

1. **Sub-millisecond Local Redaction (`< 1 ms`, zero network)**: Replaces sensitive fields (names, 15/18-digit national IDs, bank cards, mobile/landline phones, medical record & insurance IDs, order/invoice numbers, emails, street addresses, and user-defined Custom Terms) with **session-scoped numbered placeholders** (`[姓名1]`, `[姓名2]`, `[手机号1]`, `[手机号2]`, `[地址1]`, `[地址2]`). Hospitals, diagnoses, medications, and merchant names stay intact, and the placeholder mapping lives strictly in memory.
2. **Offline On-Device Summarization (Gemini Nano)**: Uses Chrome's built-in Prompt API (`window.LanguageModel`) to extract 3 concise takeaways locally—even when Chrome DevTools Network is set to **Offline** with 0 outbound requests.
3. **Consent-Gated Cloud Cross-Document Audit (Gemini 3.5 Flash Lite)**: Before any cloud call, LocalFirst shows a **Cloud Payload Preview** highlighting every placeholder in color. Once confirmed, Firebase AI Logic (`gemini-3.5-flash-lite`) audits the redacted documents together—catching cross-document anomalies without ever seeing a real name:
   - Patient `[姓名1]` (Beijing outpatient visit) ≠ paying cardholder `[姓名2]` (Shanghai pharmacy receipt)
   - Potential duplicate prescription (Amoxicillin purchased again 2 days later)
   - Arithmetic mismatch (itemized charges sum to 433.00 vs stated paid total 443.00)
   - Ineligible non-illness checkup fee mixed into the claim
4. **Memory-Only Local Restore (`restoreText`)**: Once the cloud audit returns referencing `[姓名1]` and `[姓名2]`, clicking **Local Restore** re-hydrates real names strictly in browser memory for human review—closing the privacy loop without ever exposing raw PII to the cloud.
5. **Graceful Degradation**: Local Nano and Cloud Gemini have independent status badges, `online`/`offline` listeners, a 20-second request timeout, non-blocking local controls, and a recovery card with one-click retry and collapsible technical details.

## How we built it

- **Deterministic Redaction Engine (`src/redact.ts`)**: Written in strict TypeScript with sentinel-based institution protection (shielding hospitals, pharmacies, and companies before running address/name rules), context-aware + Luhn bank card validation, session-level entity numbering, custom sensitive term overrides, and `restoreText` local hydration.
- **On-Device Path (`src/ondevice.ts`)**: Directly invokes Chrome's Built-in AI Prompt API (`window.LanguageModel`) with automatic `zh` → `en` availability probing, download progress monitoring, and isolated per-document sessions (using `session.clone()` when available).
- **Cloud & Fallback Path (`src/cloud.ts`)**: Uses Firebase JS SDK v13 (`firebase/ai`, `GoogleAIBackend`) with `gemini-3.5-flash-lite` via `InferenceMode.ONLY_IN_CLOUD` for cross-document audits (and `InferenceMode.PREFER_ON_DEVICE` only when on-device Nano is unavailable and the user confirms fallback in the preview panel), plus a 20s `AbortController` timeout and an optional `ReCaptchaV3Provider` App Check hook ready to enforce before public hosting.
- **Zero-XSS Bilingual UI (`index.html`, `src/ui.ts`, `src/main.ts`, `src/style.css`)**: Vanilla DOM built entirely with safe DOM nodes (`textContent`, `<mark>` elements—zero `innerHTML`), compact 1080p first-screen layout showing side-by-side Raw vs Redacted diff, split Local/Cloud badges, and separate latency counters (Local Redact ms / On-Device Nano s / Cloud incl. network s).

## Challenges we ran into

- **Avoiding medical false positives in Chinese address rules**: Naively matching the character `道` ("road") swallows clinical terms like `呼吸道` ("respiratory tract") and `消化道` ("digestive tract"), while hospital addresses like `北京协和医院位于北京市东城区帅府园1号` can eat the hospital name itself. We solved this with negative lookbehinds for clinical prefixes plus a sentinel pass that protects organization names before address and name propagation run (also fixing `收款人：金石，金石化工有限公司` so the company name is untouched).
- **Cross-document entity collision**: Earlier prototypes reset placeholder counters per document, turning both `张三` and `李明` into `[姓名]`, which misled cloud cross-document audits into treating two different people as one. Moving to a session-scoped memory state (`[姓名1]`, `[姓名2]`) turned that bug into our strongest hybrid-AI demo moment.
- **Bank cards vs medical/order numbers**: Unlabeled 16–19 digit rules falsely tagged invoice numbers, order serials, and medical insurance IDs as bank cards. Separating labeled medical/insurance/order IDs first and applying BIN + Luhn checks to unlabeled candidates eliminated those false positives.
- **Chrome Prompt API language support**: Because Chrome 138 Prompt API officially advertises `en`/`es`/`ja` rather than `zh`, we built a `zh` → `en` availability probe so Chinese prompts remain stable today while upgrading automatically as browsers add native `zh` support.

## Accomplishments that we're proud of

- **Quantified redaction quality**: Verified via a 30-case golden Node test suite (`npm run test:redact`): **100.0% precision (0 false positives)**, **100.0% in-scope recall (45/45)** / **97.8% overall recall (45/46 including a documented bare unlabeled Chinese name ceiling)**, running in **~0.10 ms average** locally.
- **Visible privacy guarantees**: Side-by-side Raw vs Redacted `<mark>` diff, mandatory pre-send Cloud Payload Preview, DevTools Network 0-request offline proof, and memory-only Local Restore (`[姓名1]` → `张三`) that never sends raw data over the wire.
- **Honest UX even without Gemini Nano**: Judges opening the app in a browser without Nano flags still get 100% offline local redaction, clear Nano setup instructions, and consent-gated cloud fallback rather than silent cloud routing.

## What we learned

- Hybrid AI works best when **each tier has a clear, user-visible responsibility**—not just routing everything to one endpoint behind the scenes.
- Deterministic regex redaction has known ceilings (such as bare unlabeled person names without context); pairing honest benchmark metrics with a user-controlled **Custom Terms** input and pre-send preview builds far more trust than claiming "zero leakage."
- Separating local and cloud health indicators makes offline and failure states feel resilient instead of broken.

## What's next

- Pair deterministic regex with a lightweight local NER pass (WebGPU/WASM or structured Nano JSON extraction) to catch bare unlabeled person names offline.
- Enable Firebase App Check enforcement (`reCAPTCHA v3`) + HTTP referrer restrictions and host a public demo on Firebase Hosting.
- Add local browser OCR / PDF parsing so users can drop scanned hospital bills directly into the workbench.

## Built With

- `typescript`
- `vite`
- `gemini-nano`
- `chrome-built-in-ai`
- `prompt-api`
- `firebase`
- `firebase-ai-logic`
- `gemini-3.5-flash-lite`

## 2-Minute Demo Walkthrough

1. **Opening & On-Device Medical Record Redaction (0:00–0:40)**: Click **一键演示：病历 / Medical**. Shows side-by-side Raw vs Redacted diff with highlighted `[姓名1]`–`[邮箱1]` placeholders (5 PII items scrubbed in `< 1 ms`, hospital/diagnosis/medications preserved) plus 3 concise Gemini Nano takeaways.
2. **True Offline Execution — Receipt Sample (0:40–1:02)**: Toggle Chrome DevTools Network to **Offline** (running `npm run preview`, 0 network requests) and click **一键演示：票据 / Receipt**. Redacts 4 PII items with non-colliding session IDs (`[姓名2]`, `[手机号2]`, `[银行卡号1]`, `[地址2]`), preserves pharmacy details, and updates the memory cache to 2 documents.
3. **Graceful Cloud Degradation (1:02–1:16)**: Stay **Offline** and click **云端跨文档对比 (2 份) · Cloud Cross-Doc**. Inspect the Cloud Payload Preview (placeholders only), confirm send, and show the offline degradation card: the local Nano badge stays green while only the Cloud badge switches to Offline, preserving the 2 memory-cached redacted docs. Uncheck Offline—the Cloud badge auto-recovers—and click **Retry Cloud**.
4. **Cloud Cross-Document Anomaly Audit & Local Restore (1:16–1:50)**: `gemini-3.5-flash-lite` returns a structured expense and anomaly report catching `[姓名1]` ≠ `[姓名2]`, duplicate Amoxicillin purchase, the 433.00 vs 443.00 arithmetic discrepancy, and the ineligible checkup fee—alongside Local Redact / On-Device Nano / Cloud (incl. network) latency metrics. Click **在本地还原真名 · Local Restore** to hydrate real names strictly in local memory, then toggle back to placeholders.
5. **Wrap-Up (1:50–2:00)**: Full hybrid workbench overview with LocalFirst summary card.
