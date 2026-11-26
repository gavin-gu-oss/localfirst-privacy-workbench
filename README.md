# LocalFirst Privacy Workbench (隐私病历/票据脱敏台)

**Local-first PII redaction for medical records and reimbursement receipts: scrub sensitive fields on-device in < 1 ms, summarize offline with Chrome's Gemini Nano, and send only numbered placeholders to cloud Gemini 3.5 Flash Lite for cross-document anomaly audits—then restore real names locally in memory.**

## Quick Start & What You'll See Without Gemini Nano

```bash
npm install && npm run build
npm run preview
# Open http://127.0.0.1:8123
```

- **With Chrome 138+ & Gemini Nano enabled** (verified 2026-11-26): Clicking **一键演示：病历 / Medical** or **一键演示：票据 / Receipt** redacts PII locally in sub-millisecond time and summarizes takeaways entirely on-device—even with DevTools Network set to **Offline** (0 network requests).
- **Without Gemini Nano enabled** (standard desktop browsers): Local deterministic redaction, side-by-side placeholder highlighting, custom sensitive terms, and memory-only document caching still work **100% offline**. The top bar clearly shows `端侧 Nano 未就绪 · Local Redact Only` with an expandable Chrome flags setup guide; if cloud credentials are configured, single-document summarization requires explicit confirmation in the pre-send redacted payload preview before calling cloud Gemini.
- **Public hosting note**: Before deploying `dist/` to Firebase Hosting, configure `VITE_FIREBASE_APPCHECK_SITE_KEY` (reCAPTCHA v3), enforce Firebase App Check, and restrict the Web API key by HTTP referrer in Google Cloud Console.

## Problem

People regularly want AI help to organize hospital outpatient records, pharmacy receipts, and reimbursement claims. Sending raw documents straight to cloud LLMs exposes names, national ID numbers, bank cards, medical record / insurance IDs, phone numbers, and home addresses—and breaks completely when offline in clinics or transit.

## Hybrid Inference Architecture

LocalFirst splits work cleanly across three explicit stages:

1. **Deterministic Local Redaction Engine (`src/redact.ts`, < 1 ms, zero network)**:
   - Targets Mainland China medical records and reimbursement receipts (with an optional English sample covering SSN, US phone, email, address, and labeled names).
   - **Session-scoped numbered placeholders**: Maintains an in-memory session mapping across documents so distinct people and contacts never collide (`[姓名1]` vs `[姓名2]`, `[手机号1]` vs `[手机号2]`, `[地址1]` vs `[地址2]`), enabling accurate cross-document comparison without revealing real identities.
   - **Institution sentinel protection**: Protects hospital, pharmacy, clinic, and company names before running address and name rules (preventing cases like `北京协和医院位于...` or `收款人：金石，金石化工有限公司` from being corrupted).
   - **Context-aware + Luhn bank card detection**: Separates medical record IDs (`[病历号]`), insurance IDs (`[医保号]`), and order/invoice serials (`[单号]`) before matching bank cards, applying BIN + Luhn checks to unlabeled card numbers.
   - **Custom sensitive terms & doctor-name policy**: Attending physician names (e.g. `接诊医师：林医生`) are intentionally preserved by default as provider metadata useful for reimbursement audits; users can mask any doctor name or ad-hoc identifier via the **Custom Terms** input.
   - **Memory-only mapping + Local Restore (`restoreText`)**: The placeholder-to-original map exists only in runtime memory. After a cloud report returns using `[姓名1]` / `[姓名2]`, users can toggle **在本地还原真名 · Local Restore** to inspect real names strictly on their own device.
2. **On-Device Extraction (`src/ondevice.ts` + Chrome Prompt API)**:
   - Calls Chrome's built-in `window.LanguageModel` (Gemini Nano) directly for single-document 3-bullet extraction, working fully offline (`navigator.onLine === false`) in seconds.
   - Automatically probes `zh` language availability and falls back cleanly to the verified `en` declaration when `zh` is not yet advertised by the browser build.
3. **Cloud Cross-Document Audit & Graceful Degradation (`src/cloud.ts`, `src/main.ts`)**:
   - Uses **Firebase AI Logic** (`firebase/ai`, `GoogleAIBackend`, default model **`gemini-3.5-flash-lite`**) with `InferenceMode.ONLY_IN_CLOUD` for multi-document expense reconciliation and anomaly checks (e.g., patient `[姓名1]` ≠ cardholder `[姓名2]`, cross-city spending, duplicate Amoxicillin purchase within 2 days, itemized sum `433.00` vs paid total `443.00` discrepancy, ineligible checkup fee).
   - Uses `InferenceMode.PREFER_ON_DEVICE` only when on-device Nano is unavailable and the user explicitly confirms cloud fallback via the **Pre-Send Payload Preview**.
   - **Independent status & resilience**: Local Nano and Cloud Gemini have separate status badges, automatic `online`/`offline` listeners, a 20-second request timeout, non-blocking local controls during cloud requests, and an actionable degraded card with one-click retry and collapsible technical details.

## Quantified Redaction Benchmark & Verification

Run the local Node golden test suite anytime:

```bash
npm run test:redact
```

- **Golden Test Suite (30 boundary cases)**:
  - **In-scope rule suite (29 cases, 45 PII targets)**: **100.0% precision (0 false positives)**, **100.0% recall (45/45)**, preserving all hospitals, diagnoses, medications, and merchant names in the built-in samples and edge cases.
  - **Full suite including documented regex ceiling (30 cases, 46 PII targets)**: **100.0% precision**, **97.8% recall (45/46)**—the 1 documented limitation is a bare, unlabeled Chinese name with no surrounding role context or prior session occurrence (handled via Custom Terms).
  - **Average redaction latency**: **~0.10 ms** per document in Node.js (`< 1 ms` in browser).
- **End-to-End Hybrid Pipeline**:
  - **On-device medical & receipt demos**: Verified PASS in Chrome 138+ with Gemini Nano (5 PII items in medical sample, 4 in receipt sample; hospital/diagnosis/medication/merchant terms preserved; 0 outbound requests in Offline mode).
  - **Cloud cross-document comparison**: Verified PASS with Firebase AI Logic (`gemini-3.5-flash-lite`, ~5.2s incl. network) generating structured expense/anomaly reports strictly from redacted placeholders; offline and HTTP 401/403/404/429/timeout failures degrade gracefully while preserving memory-cached redacted documents.

## Local Setup

### Prerequisites

- **Node.js 20.19+ or 22.12+** (required by Vite 8; tested on Node 24)
- **Google Chrome 138+** with Gemini Nano enabled (flags verified 2026-11-26):
  1. `chrome://flags/#optimization-guide-on-device-model` → **Enabled BypassPerfRequirement**
  2. `chrome://flags/#prompt-api-for-gemini-nano` → **Enabled**
- Restart Chrome and confirm `await LanguageModel.availability()` returns `"available"` (if `"downloadable"`, trigger the initial on-device model download while online before testing offline).

### Install, Test & Build

```bash
npm install
npm run test:redact
npm run build
```

Run the production preview server (recommended for Offline DevTools demos at `http://127.0.0.1:8123` to avoid Vite HMR traffic):

```bash
npm run preview
# or dev server:
npm run dev
```

### Optional Cloud Configuration

Copy `.env.example` to `.env.local` and fill in your 6 Firebase Web App fields (`VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_STORAGE_BUCKET`, `VITE_FIREBASE_MESSAGING_SENDER_ID`, `VITE_FIREBASE_APP_ID`). Default cloud model is `VITE_FIREBASE_CLOUD_MODEL=gemini-3.5-flash-lite`.

`src/cloud.ts` also includes an optional Firebase App Check (`ReCaptchaV3Provider`) hook via `VITE_FIREBASE_APPCHECK_SITE_KEY` (and `VITE_FIREBASE_APPCHECK_DEBUG_TOKEN` for local development). Enable App Check enforcement and API key HTTP referrer restrictions before public deployment.

## Privacy Statement

- **Local-first redaction**: Regex PII redaction executes synchronously in the browser with zero network requests. When Chrome Gemini Nano is ready, single-document extraction also runs completely locally and offline.
- **Memory-only PII mapping**: Placeholder mappings stay strictly in JavaScript heap memory and are never written to `localStorage`, `IndexedDB`, cookies, or remote servers. Clicking **清空内存 · Clear** wipes both cached redacted docs and mappings immediately.
- **Consent-gated, redacted-only cloud handoff**: Cloud Gemini is invoked only after showing the user an explicit preview of the exact redacted text to be transmitted. Clipboard copy always copies the redacted version by default.

## Tech Stack

- **Frontend**: TypeScript 7, Vite 8, Vanilla DOM + CSS
- **On-Device AI**: Chrome Built-in AI Prompt API (`window.LanguageModel` / Gemini Nano)
- **Cloud AI SDK**: Firebase JS SDK v13 (`firebase/ai`, Firebase AI Logic, `GoogleAIBackend`, `InferenceMode`) + **Gemini 3.5 Flash Lite** (`gemini-3.5-flash-lite`)

## License

MIT — see [LICENSE](./LICENSE).
