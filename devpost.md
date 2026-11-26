# Devpost Submission Copy

## Project Title

LocalFirst Privacy Workbench

## Tagline

Zero-leakage local PII redaction & summarization powered by Gemini Nano, paired with cloud Gemini cross-document reasoning via Firebase AI Logic.

## Project Description

Everyday documents like hospital outpatient records, pharmacy receipts, and reimbursement invoices contain both high-value structured facts (diagnoses, prescriptions, itemized charges) and highly sensitive personal identifiers (names, national ID numbers, bank card numbers, phone numbers, home addresses, and emails). Uploading raw records straight to a cloud AI service exposes private data to unnecessary third-party risk, while purely cloud-dependent tools break completely in offline or restricted environments such as clinics, hospitals, or transit.

LocalFirst Privacy Workbench solves this with a local-first hybrid workflow right inside the browser. First, a deterministic, zero-network redaction engine (`src/redact.ts`) scrubs sensitive identifiers—names across labeled/context/honorific forms, 15/18-digit national IDs (case-insensitive `X`/`x`, continuous or segmented), continuous or spaced/hyphenated bank cards and phone numbers, emails, and Chinese street addresses—into bracketed placeholders (`[姓名]`, `[身份证号]`, etc.) while keeping clinical and merchant facts intact. All placeholder mappings stay strictly in memory. Next, Chrome's built-in Gemini Nano model summarizes the redacted document into 3 concise takeaways entirely on-device, even when `navigator.onLine === false`.

Under the hood, our hybrid architecture makes the division of labor unmistakable to users and judges: a live 3-step pipeline strip, one-click demo triggers, memory-cached redacted document counters, `On-Device Nano` vs `Cloud Gemini` badges, redaction category chips, and side-by-side latency metrics. Single-document redaction and summarization run locally through Chrome's Prompt API (`window.LanguageModel`), while `src/cloud.ts` implements Firebase AI Logic (`InferenceMode.PREFER_ON_DEVICE` fallback and `InferenceMode.ONLY_IN_CLOUD` cross-document expense aggregation and anomaly detection) transmitting only already-redacted texts. When cloud endpoints are unreachable or gated (such as offline mode or Firebase App Check HTTP 401 enforcement), the UI degrades gracefully with clear recovery guidance while keeping local redaction and on-device Nano completely unaffected.

We chose **Firebase AI Logic** (`firebase/ai` with `GoogleAIBackend`) because it provides a single, clean TypeScript SDK for hybrid `InferenceMode` routing (`PREFER_ON_DEVICE` and `ONLY_IN_CLOUD`), runtime attribution via `response.inferenceSource`, and a direct upgrade path to **Firebase App Check** (reCAPTCHA v3 for production and debug tokens for local demos) without requiring a custom backend proxy to protect Gemini API credentials.

## Built With

- TypeScript & Vite
- Chrome Built-in AI Prompt API (Gemini Nano)
- Firebase JS SDK (`firebase/ai`, Firebase AI Logic, `GoogleAIBackend`)
- Gemini 2.5 Flash Lite (Cloud reasoning)
- Firebase App Check (integration hook ready)
- Deterministic Regex PII Redaction Engine (memory-only mapping)

## Verification Status & Demo Flow

- **On-Device Pipeline (Verified PASS)**: Tested end-to-end in Chrome 138+ with Gemini Nano enabled. Medical record sample redacts all 5 PII items with zero false positives on hospital/diagnosis/medication terms; reimbursement receipt sample redacts all 4 PII items with zero false positives on merchant names; works completely offline with zero outbound requests.
- **Cloud Cross-Document Pipeline (Code-Ready, Pending App Check Toggle)**: Implemented in `src/cloud.ts` via Firebase AI Logic (`GoogleAIBackend`, `InferenceMode.ONLY_IN_CLOUD`, `response.inferenceSource`) with an App Check hook (`ReCaptchaV3Provider`). Currently gated by Firebase Console App Check enforcement (HTTP 401) prior to final demo recording; when blocked, the app surfaces clear recovery instructions while preserving local redaction and cached redacted documents in memory.

### Planned 2-Minute Demo Walkthrough

1. **On-Device Medical Record Redaction & Summarization**: Click the one-click medical demo (or `btn-sample-medical` + `btn-ondevice`). Shows 5 PII fields scrubbed locally with zero false positives, category placeholder chips, 3 concise Nano takeaways, `On-Device Nano` badge, and live latency.
2. **True Offline Execution**: Toggle Chrome DevTools Network to **Offline**, run the receipt sample (`btn-sample-receipt` + `btn-ondevice`). Confirms 4 PII fields are redacted and summarized locally with zero network requests while preserving merchant details.
3. **Cloud Cross-Document Comparison (once App Check enforcement is lifted for recording)**: Re-enable network and click `btn-cloud`. Sends only the 2 memory-cached redacted texts via Firebase AI Logic for expense aggregation and anomaly checking, switching the badge to `Cloud Gemini (Firebase AI)` with side-by-side latency metrics.
