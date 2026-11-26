import "./style.css";
import {
  checkOnDeviceAvailability,
  promptOnDevice,
  resetOnDeviceSession,
  type NanoAvailability,
} from "./ondevice";
import { isCloudConfigured, runCrossDocCompare, runFirebaseAI } from "./cloud";
import { redactText, type RedactResult } from "./redact";
import {
  dom,
  SAMPLES,
  renderEngineStatus,
  renderLatency,
  renderOutput,
  renderState,
  setBusy,
  type AppState,
} from "./ui";

let state: AppState = "INIT";
let nanoStatus: NanoAvailability = "unsupported";

// Memory-only redaction state: never written to storage or sent over network.
let lastRedaction: RedactResult | null = null;
const redactedDocsMemory: string[] = [];

function transition(next: AppState): void {
  state = next;
  renderState(state);
}

function rememberRedactedDoc(doc: string): void {
  if (!doc || redactedDocsMemory.includes(doc)) return;
  redactedDocsMemory.push(doc);
  if (redactedDocsMemory.length > 5) redactedDocsMemory.shift();
}

function buildExtractPrompt(redactedText: string): string {
  return [
    "从以下已脱敏文本提炼恰好 3 条中文核心要点，每条不超过 20 字。",
    "只输出要点，不解释、不重复原文；每条一行，格式「要点：内容」，保留方括号占位符。",
    "",
    redactedText,
  ].join("\n");
}

const MAX_SUMMARY_RAW_CHARS = 4000;
const MAX_SUMMARY_LINES = 20;
const MAX_BULLET_CHARS = 300;

function normalizeBullets(raw: string): string {
  if (typeof raw !== "string") return "（未生成有效要点）";
  const cleaned = raw
    .slice(0, MAX_SUMMARY_RAW_CHARS)
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");

  const result: string[] = [];
  for (const rawLine of cleaned.split("\n")) {
    let line = rawLine.trim();
    if (!line) continue;
    if (/^`+$/.test(line) || /^【(?:提炼|核心)?要点】$/.test(line)) continue;

    for (let i = 0; i < 5; i++) {
      const next = line
        .replace(/^[-–—](?!\d)\s*/, "")
        .replace(/^[•·●▪▫‣⁃]\s*/, "")
        .replace(/^\*(?!\*)\s*/, "")
        .replace(/^(?:[（(]\d{1,2}[)）]|\d{1,2}[.、)）](?!\d))\s*/, "")
        .replace(/^\*{0,2}(?:核心|提炼|主要)?要点(?:\s*\d{1,2})?\*{0,2}\s*[:：]\*{0,2}\s*/, "")
        .trim();
      if (next === line) break;
      line = next;
    }

    if (
      !line ||
      /^\*{0,2}(?:核心|提炼|主要)?要点(?:\s*\d{1,2})?\*{0,2}$/.test(line) ||
      /^[-–—•·*●▪▫‣⁃=:：\s]+$/.test(line)
    ) {
      continue;
    }

    if (line.length > MAX_BULLET_CHARS) {
      line = `${line.slice(0, MAX_BULLET_CHARS)}…`;
    }
    result.push(`要点：${line}`);
    if (result.length >= MAX_SUMMARY_LINES) break;
  }

  return result.length > 0 ? result.join("\n") : "（未生成有效要点）";
}

function formatLocalResult(redaction: RedactResult, summary: string): string {
  const count = Object.keys(redaction.mapping).length;
  return [
    `【脱敏后文本】（已本地替换 ${count} 项敏感信息，映射表仅存内存）`,
    redaction.redacted,
    "",
    "【提炼要点】",
    normalizeBullets(summary),
  ].join("\n");
}

async function init(): Promise<void> {
  transition("INIT");
  nanoStatus = await checkOnDeviceAvailability();
  if (nanoStatus === "available" || nanoStatus === "downloadable") {
    transition("READY_LOCAL");
    renderEngineStatus("on_device", `On-Device Nano (${nanoStatus})`);
  } else {
    transition("READY_CLOUD_ONLY");
    renderEngineStatus("in_cloud", `Cloud Gemini（端侧: ${nanoStatus}）`);
  }
}

async function handleLocalRedactAndExtract(): Promise<void> {
  const raw = dom.inputText().value.trim();
  if (!raw) {
    renderOutput("请先粘贴文本，或点击上方「填入病历样例」「填入票据样例」。");
    return;
  }
  setBusy(true);
  try {
    const redaction = redactText(raw);
    lastRedaction = redaction;
    rememberRedactedDoc(redaction.redacted);
    const prompt = buildExtractPrompt(redaction.redacted);

    if (nanoStatus === "available" || nanoStatus === "downloadable") {
      transition("RUNNING_LOCAL");
      renderEngineStatus("on_device", "On-Device Nano 推理中...");
      resetOnDeviceSession();
      const res = await promptOnDevice(prompt, (pct) =>
        renderEngineStatus("on_device", `Nano 模型下载中 ${pct}%`)
      );
      renderLatency("on_device", res.latencyMs);
      renderEngineStatus("on_device", "On-Device Nano (本机)");
      renderOutput(formatLocalResult(redaction, res.text));
      transition("READY_LOCAL");
      return;
    }

    transition("FALLBACK_CLOUD");
    if (!isCloudConfigured()) {
      throw new Error("端侧不可用且 Firebase 云端尚未配置，请先在 .env.local 填入配置。");
    }
    renderEngineStatus("in_cloud", "Cloud Gemini 回退推理中...");
    const res = await runFirebaseAI(prompt, true);
    renderLatency(res.source, res.latencyMs);
    renderEngineStatus(
      res.source,
      res.source === "on_device" ? "On-Device Nano (SDK)" : "Cloud Gemini (Firebase AI)"
    );
    renderOutput(formatLocalResult(redaction, res.text));
    transition("READY_CLOUD_ONLY");
  } catch (err) {
    transition("ERROR");
    renderEngineStatus("error", "本地脱敏提炼失败");
    renderOutput(`错误：${err instanceof Error ? err.message : String(err)}`);
  } finally {
    setBusy(false);
  }
}

async function handlePing(): Promise<void> {
  setBusy(true);
  try {
    if (nanoStatus !== "available" && nanoStatus !== "downloadable") {
      throw new Error(`当前端侧 Nano 不可用（状态：${nanoStatus}）。`);
    }
    transition("RUNNING_LOCAL");
    renderEngineStatus("on_device", "On-Device Nano 自检中...");
    const res = await promptOnDevice(
      "Reply in 5 words: local Gemini Nano scaffold works.",
      (pct) => renderEngineStatus("on_device", `Nano 模型下载中 ${pct}%`)
    );
    renderLatency("on_device", res.latencyMs);
    renderEngineStatus("on_device", "On-Device Nano (本机)");
    renderOutput(res.text);
    transition("READY_LOCAL");
  } catch (err) {
    transition("ERROR");
    renderEngineStatus("error", "端侧自检失败");
    renderOutput(`错误：${err instanceof Error ? err.message : String(err)}`);
  } finally {
    setBusy(false);
  }
}

async function handleCloudCompare(): Promise<void> {
  const raw = dom.inputText().value.trim();
  const docs: string[] = [...redactedDocsMemory];

  if (raw) {
    for (const part of raw.split(/\n-{3,}\n/)) {
      const trimmed = part.trim();
      if (!trimmed) continue;
      const res = redactText(trimmed);
      lastRedaction = res;
      if (!docs.includes(res.redacted)) docs.push(res.redacted);
    }
  }

  if (docs.length === 0) {
    renderOutput("请先输入文本或先点击样例并运行脱敏，再进行云端深度对比。");
    return;
  }

  setBusy(true);
  transition("RUNNING_CLOUD");
  renderEngineStatus("in_cloud", "Cloud Gemini 跨文档对比中...");
  const t0 = performance.now();
  try {
    const report = await runCrossDocCompare(docs);
    const latencyMs = Math.round(performance.now() - t0);
    renderLatency("in_cloud", latencyMs);
    renderEngineStatus("in_cloud", "Cloud Gemini (Firebase AI)");
    renderOutput(
      `【云端跨文档对比报告】（已发送 ${docs.length} 份本地脱敏文本）\n\n${report.trim()}`
    );
    transition(nanoStatus === "available" ? "READY_LOCAL" : "READY_CLOUD_ONLY");
  } catch (err) {
    transition("ERROR");
    renderEngineStatus("error", "云端不可用");
    renderOutput(`错误：${err instanceof Error ? err.message : String(err)}`);
  } finally {
    setBusy(false);
  }
}

function fillSample(kind: keyof typeof SAMPLES, label: string): void {
  dom.inputText().value = SAMPLES[kind];
  renderOutput(`已填入${label}（虚构演示数据，映射表仅存内存）。点击「本地脱敏 + 提炼 (Nano)」开始处理。`);
}

dom.btnLocal().addEventListener("click", () => void handleLocalRedactAndExtract());
dom.btnPing().addEventListener("click", () => void handlePing());
dom.btnCloud().addEventListener("click", () => void handleCloudCompare());
dom.btnSampleMedical().addEventListener("click", () => fillSample("medical", "病历样例"));
dom.btnSampleReceipt().addEventListener("click", () => fillSample("receipt", "票据样例"));

void lastRedaction;
void init();
