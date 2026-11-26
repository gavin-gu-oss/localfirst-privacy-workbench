# Devpost Submission Copy

## Project Title

LocalFirst Privacy Workbench

## Tagline

Zero-leakage local PII redaction & summarization powered by Gemini Nano, paired with cloud Gemini cross-document reasoning via Firebase AI Logic.

## Project Description

Everyday documents like hospital outpatient records, pharmacy receipts, and reimbursement invoices contain both high-value structured facts (diagnoses, prescriptions, itemized charges) and highly sensitive personal identifiers (names, national ID numbers, bank card numbers, phone numbers, home addresses, and emails). Uploading raw records straight to a cloud AI service exposes private data to unnecessary third-party risk, while purely cloud-dependent tools break completely in offline or restricted environments such as clinics, hospitals, or transit.

LocalFirst Privacy Workbench solves this with a local-first hybrid workflow right inside the browser. First, a deterministic, zero-network redaction engine scrubs PII into bracketed placeholders (such as `[姓名]` and `[身份证号]`) while keeping non-sensitive domain terms—hospital names, diagnoses, medications, merchant names, and amounts—intact. Next, Chrome's built-in Gemini Nano model summarizes the redacted document into concise key takeaways entirely on-device, even when the browser is completely offline.

Under the hood, our hybrid inference layer orchestrates on-device and cloud execution transparently. For single-document redaction and summarization, the app runs local regex scrubbing followed by Chrome's Prompt API (`window.LanguageModel`) with live status badges (`On-Device Nano` vs `Cloud Gemini`) and side-by-side latency metrics. If on-device Nano is unavailable on a given browser, `src/cloud.ts` falls back gracefully through Firebase AI Logic using `InferenceMode.PREFER_ON_DEVICE`, while cross-document expense reconciliation and anomaly detection explicitly invoke `InferenceMode.ONLY_IN_CLOUD`—transmitting only already-redacted documents so raw PII never leaves the user's machine.

We chose **Firebase AI Logic** (`firebase/ai` with `GoogleAIBackend`) because it provides a single, clean TypeScript SDK for hybrid `InferenceMode` routing (`PREFER_ON_DEVICE` and `ONLY_IN_CLOUD`), runtime attribution via `response.inferenceSource`, and a direct upgrade path to **Firebase App Check** (reCAPTCHA v3 for production and debug tokens for local demos) without requiring a custom backend proxy to protect Gemini API credentials.

## Built With

- TypeScript & Vite
- Chrome Built-in AI Prompt API (Gemini Nano)
- Firebase JS SDK (`firebase/ai`, Firebase AI Logic, `GoogleAIBackend`)
- Gemini 2.5 Flash Lite (Cloud reasoning)
- Firebase App Check (integration hook ready)
- Deterministic Regex PII Redaction Engine (memory-only mapping)

## Demo Video Overview

The 2-minute demo video walks through three live, unedited scenarios in Chrome 138+ with DevTools Network open:

1. **On-Device Medical Record Redaction & Summarization**: Load the built-in medical record sample (`btn-sample-medical`) and click **Local Redact + Extract** (`btn-ondevice`). Shows 5 PII fields scrubbed locally with zero false positives on hospital/diagnosis/medication terms, 3 concise Nano takeaways, the `On-Device Nano` badge, and live on-device latency.
2. **True Offline Execution**: Toggle Chrome DevTools Network to **Offline** (`navigator.onLine === false`), load the reimbursement receipt sample (`btn-sample-receipt`), and run `btn-ondevice` again. Proves 4 PII fields are redacted and summarized locally with zero outbound requests.
3. **Online Cloud Cross-Document Comparison**: Re-enable the network and click **Cloud Deep Compare / Report** (`btn-cloud`). Shows the badge switching to `Cloud Gemini (Firebase AI)`, a structured cross-document expense & anomaly report generated exclusively from the previously redacted texts, and side-by-side latency comparison between On-Device Nano and Cloud Gemini.
