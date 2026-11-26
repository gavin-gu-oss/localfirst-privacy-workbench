# LocalFirst Privacy Workbench

**Redact sensitive medical records and financial receipts 100% locally with Gemini Nano, then run deep cross-document analysis in the cloud with Gemini via Firebase AI Logic.**

## Problem

People regularly need AI help to organize medical records, insurance receipts, and reimbursement documents. Sending raw documents directly to cloud LLMs leaks personally identifiable information (PII)—names, national ID numbers, bank cards, phone numbers, home addresses, and email addresses—and stops working altogether when offline.

## Hybrid Inference Architecture

LocalFirst Privacy Workbench splits inference cleanly between on-device and cloud execution:

1. **Local Deterministic Redaction (`src/redact.ts`)**: Runs synchronously in the browser to replace PII—names (labeled, contextual, honorific), 15/18-digit ID numbers (including `X`/`x` and segmented formats), continuous or spaced/hyphenated bank cards and phone numbers, emails, and Chinese addresses—with structured placeholders like `[姓名]` and `[身份证号]` while preserving clinical and financial facts (hospitals, diagnoses, medications, merchants, amounts). The redaction mapping stays strictly in memory.
2. **On-Device Extraction (`src/ondevice.ts` + Chrome Prompt API)**: Uses `window.LanguageModel` (Gemini Nano) to summarize the redacted text locally—working even with `navigator.onLine === false`, with one-click demo buttons, live pipeline step indicators, and redaction summary chips.
3. **Hybrid Fallback, Cloud Cross-Document Reasoning & Graceful Degradation (`src/cloud.ts`, `src/main.ts`)**:
   - When on-device Nano is unavailable, single-document extraction falls back using Firebase AI Logic (`InferenceMode.PREFER_ON_DEVICE`, default `gemini-2.5-flash-lite`) and inspects `response.inferenceSource` (`ON_DEVICE` vs `IN_CLOUD`).
   - Clicking **云端深度对比 / 报告 (Cloud)** transmits only locally redacted documents via `InferenceMode.ONLY_IN_CLOUD` for cross-document expense aggregation and anomaly checks.
   - If cloud calls are unavailable (e.g., offline or Firebase App Check HTTP 401 enforcement), the UI displays actionable recovery guidance while preserving local redaction and memory-cached redacted documents.

## Current Verification Status

- **On-device redaction + Gemini Nano extraction**: Verified PASS (medical sample: 5 PII items redacted with zero false positives; receipt sample: 4 PII items redacted with zero false positives; offline execution confirmed).
- **Cloud cross-document comparison**: Implementation ready in `src/cloud.ts` (Firebase AI Logic + App Check hook); currently gated by Firebase Console App Check enforcement (HTTP 401) until enforcement is relaxed or a debug token is registered.

## Local Setup

### Prerequisites

- Node.js 18+
- **Google Chrome 138+** with Gemini Nano enabled via two flags:
  1. `chrome://flags/#optimization-guide-on-device-model` → **Enabled BypassPerfRequirement**
  2. `chrome://flags/#prompt-api-for-gemini-nano` → **Enabled**
- Restart Chrome and verify `await LanguageModel.availability()` returns `"available"` (or `"downloadable"`).

### Install & Build

```bash
npm install && npm run build
```

Start the local server (serves at `http://127.0.0.1:8123`):

```bash
npm run dev
# or preview the production build:
npm run preview
```

### Optional Cloud Configuration

Copy `.env.example` to `.env.local` and fill in the 6 Firebase Web App fields (`VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_STORAGE_BUCKET`, `VITE_FIREBASE_MESSAGING_SENDER_ID`, `VITE_FIREBASE_APP_ID`). For App Check protection, `src/cloud.ts` includes an activation hook supporting `VITE_FIREBASE_APPCHECK_SITE_KEY` (reCAPTCHA v3 in production) and `VITE_FIREBASE_APPCHECK_DEBUG_TOKEN` (for local demos).

## Privacy Statement

- **On-device data never leaves your machine**: Redaction and Gemini Nano summarization execute 100% locally inside Chrome with zero network calls and full offline support.
- **Memory-only PII mapping**: The placeholder-to-original mapping table exists only in runtime memory and is never persisted to `localStorage`, `IndexedDB`, cookies, or remote servers.
- **Explicit, redacted-only cloud handoff**: Cloud Gemini is invoked only when the user clicks the cloud comparison action (or when on-device Nano is unsupported), and only already-redacted text with placeholders is transmitted.

## Tech Stack

- **Frontend**: TypeScript 7, Vite 8, Vanilla DOM + CSS
- **On-Device AI**: Chrome Built-in AI Prompt API (`window.LanguageModel` / Gemini Nano)
- **Cloud & Hybrid SDK**: Firebase JS SDK v13 (`firebase/ai`, Firebase AI Logic, `GoogleAIBackend`, `InferenceMode`) + Gemini 2.5 Flash Lite
- **Security Hook**: Firebase App Check (`firebase/app-check`, `ReCaptchaV3Provider`)

## License

MIT — see [LICENSE](./LICENSE).
