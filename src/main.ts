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
  renderMemoryCount,
  renderOutput,
  renderOutputMode,
  renderPipelineStep,
  renderRedactSummary,
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
  renderMemoryCount(redactedDocsMemory.length);
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

interface CloudErrorInfo {
  badge: string;
  title: string;
  reason: string;
  steps: string[];
  raw: string;
}

function classifyCloudError(err: unknown): CloudErrorInfo {
  const raw = err instanceof Error ? err.message : String(err);
  if (/401|app[\s_-]?check|unauthenticated/i.test(raw)) {
    return {
      badge: "云端暂不可用 (App Check 401)",
      title: "【云端深度分析暂时不可用 · Firebase App Check 校验拦截 (HTTP 401)】",
      reason:
        "Firebase 后端当前开启了 App Check 强制校验，本次云端请求暂未放行。",
      steps: [
        "本地能力不受影响：您的文本已在浏览器本地脱敏，映射表仅存内存；可立即继续使用「本地脱敏 + 提炼 (Nano)」（断网亦可用）。",
        "如需启用云端跨文档对比：请在 Firebase Console → App Check 关闭强制校验，或配置有效调试令牌后刷新页面。",
        "云端恢复后直接再次点击「云端深度对比 / 报告 (Cloud)」，将自动复用内存中的脱敏文档。",
      ],
      raw,
    };
  }
  if (!navigator.onLine || /failed to fetch|network|offline|err_internet/i.test(raw)) {
    return {
      badge: "当前离线 · 云端暂不可用",
      title: "【当前处于离线或网络受限状态 · 云端暂不可用】",
      reason: "无法连接 Firebase 云端服务（当前为离线或网络不可达状态）。",
      steps: [
        "本地脱敏与端侧 Gemini Nano 提炼完全不受断网影响，可继续离线使用。",
        "恢复网络连接后，直接再次点击「云端深度对比 / 报告 (Cloud)」即可完成跨文档对比。",
      ],
      raw,
    };
  }
  if (/尚未配置|\.env\.local/i.test(raw)) {
    return {
      badge: "云端未配置 · 端侧正常",
      title: "【Firebase 云端尚未配置 · 本地脱敏与端侧 Nano 正常可用】",
      reason: "尚未在 .env.local 填入 Firebase Web App 配置，因此云端对比暂未启用。",
      steps: [
        "可直接使用「本地脱敏 + 提炼 (Nano)」体验完整的端侧离线脱敏与要点提炼。",
        "如需启用云端跨文档分析，请参考 README 配置 .env.local 后重启本地服务。",
      ],
      raw,
    };
  }
  return {
    badge: "云端暂不可用 · 端侧正常",
    title: "【云端深度分析暂时不可用】",
    reason: "云端推理请求未成功完成，但本地隐私脱敏未受任何影响，原始敏感信息未离开本机。",
    steps: [
      "可继续使用「本地脱敏 + 提炼 (Nano)」进行离线本地处理。",
      "稍后可直接再次点击「云端深度对比 / 报告 (Cloud)」重试。",
    ],
    raw,
  };
}

function formatCloudDegradedMessage(
  info: CloudErrorInfo,
  docsCount?: number
): string {
  const lines = [info.title, "", `原因：${info.reason}`];
  if (docsCount && docsCount > 0) {
    lines.push(
      `状态：内存已为您保留 ${docsCount} 份本地脱敏文档，无需重新输入。`
    );
  }
  lines.push("", "下一步建议：", ...info.steps.map((s, i) => `${i + 1}. ${s}`));
  lines.push("", `技术详情：${info.raw}`);
  return lines.join("\n");
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
    renderOutput("请先粘贴文本，或点击上方「一键演示」「填入病历样例」「填入票据样例」。");
    return;
  }
  setBusy(true);
  let redaction: RedactResult | null = null;
  let usingCloudFallback = false;
  try {
    redaction = redactText(raw);
    lastRedaction = redaction;
    rememberRedactedDoc(redaction.redacted);
    renderRedactSummary(redaction.mapping);
    const prompt = buildExtractPrompt(redaction.redacted);

    if (nanoStatus === "available" || nanoStatus === "downloadable") {
      transition("RUNNING_LOCAL");
      renderPipelineStep("local");
      renderEngineStatus("on_device", "On-Device Nano 推理中...");
      resetOnDeviceSession();
      const res = await promptOnDevice(prompt, (pct) =>
        renderEngineStatus("on_device", `Nano 模型下载中 ${pct}%`)
      );
      renderLatency("on_device", res.latencyMs);
      renderEngineStatus("on_device", "On-Device Nano (本机)");
      renderOutputMode("端侧输出 · On-Device Nano", "local");
      renderPipelineStep("local_done");
      renderOutput(formatLocalResult(redaction, res.text));
      transition("READY_LOCAL");
      return;
    }

    usingCloudFallback = true;
    transition("FALLBACK_CLOUD");
    renderPipelineStep("cloud");
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
    renderOutputMode(
      res.source === "on_device" ? "端侧输出 · Nano (SDK)" : "云端回退 · Cloud Gemini",
      res.source === "on_device" ? "local" : "cloud"
    );
    renderPipelineStep(res.source === "on_device" ? "local_done" : "cloud_done");
    renderOutput(formatLocalResult(redaction, res.text));
    transition("READY_CLOUD_ONLY");
  } catch (err) {
    transition("ERROR");
    if (usingCloudFallback && redaction) {
      const info = classifyCloudError(err);
      const count = Object.keys(redaction.mapping).length;
      renderEngineStatus("error", info.badge, "云端受阻 · 本地脱敏已完成");
      renderOutputMode("本地已脱敏 · 云端降级", "warn");
      renderPipelineStep("cloud_degraded");
      renderOutput(
        [
          `【脱敏后文本】（已本地替换 ${count} 项敏感信息，映射表仅存内存）`,
          redaction.redacted,
          "",
          formatCloudDegradedMessage(info, redactedDocsMemory.length),
        ].join("\n")
      );
    } else {
      renderEngineStatus("error", "本地脱敏提炼失败");
      renderOutputMode("推理受阻", "warn");
      renderOutput(`错误：${err instanceof Error ? err.message : String(err)}`);
    }
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
    renderPipelineStep("local");
    renderEngineStatus("on_device", "On-Device Nano 自检中...");
    const res = await promptOnDevice(
      "Reply in 5 words: local Gemini Nano scaffold works.",
      (pct) => renderEngineStatus("on_device", `Nano 模型下载中 ${pct}%`)
    );
    renderLatency("on_device", res.latencyMs);
    renderEngineStatus("on_device", "On-Device Nano (本机)");
    renderRedactSummary(null);
    renderOutputMode("端侧自检通过", "local");
    renderPipelineStep("local_done");
    renderOutput(res.text);
    transition("READY_LOCAL");
  } catch (err) {
    transition("ERROR");
    renderEngineStatus("error", "端侧自检失败");
    renderOutputMode("端侧自检失败", "warn");
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
      rememberRedactedDoc(res.redacted);
      if (!docs.includes(res.redacted)) docs.push(res.redacted);
    }
  }

  if (docs.length === 0) {
    renderOutput("请先输入文本或点击上方「一键演示」/样例运行脱敏，再发起云端深度对比。");
    return;
  }

  setBusy(true);
  transition("RUNNING_CLOUD");
  renderPipelineStep("cloud");
  renderEngineStatus("in_cloud", "Cloud Gemini 跨文档对比中...");
  const t0 = performance.now();
  try {
    const report = await runCrossDocCompare(docs);
    const latencyMs = Math.round(performance.now() - t0);
    renderLatency("in_cloud", latencyMs);
    renderEngineStatus("in_cloud", "Cloud Gemini (Firebase AI)");
    renderRedactSummary(null);
    renderOutputMode("云端输出 · Cloud Gemini", "cloud");
    renderPipelineStep("cloud_done");
    renderOutput(
      `【云端跨文档对比报告】（已发送 ${docs.length} 份本地脱敏文本）\n\n${report.trim()}`
    );
    transition(nanoStatus === "available" ? "READY_LOCAL" : "READY_CLOUD_ONLY");
  } catch (err) {
    const info = classifyCloudError(err);
    transition("ERROR");
    renderEngineStatus("error", info.badge, "云端受阻 · 本地脱敏不受影响");
    renderOutputMode("云端降级提示", "warn");
    renderPipelineStep("cloud_degraded");
    renderOutput(formatCloudDegradedMessage(info, docs.length));
  } finally {
    setBusy(false);
  }
}

function fillSample(kind: keyof typeof SAMPLES, label: string): void {
  dom.inputText().value = SAMPLES[kind];
  renderRedactSummary(null);
  renderOutputMode("已填入样例", "idle");
  renderOutput(`已填入${label}（虚构演示数据，映射表仅存内存）。点击「本地脱敏 + 提炼 (Nano)」开始处理。`);
}

async function runQuickDemo(kind: keyof typeof SAMPLES): Promise<void> {
  dom.inputText().value = SAMPLES[kind];
  await handleLocalRedactAndExtract();
}

async function handleCopyOutput(): Promise<void> {
  const btn = dom.btnCopyOutput();
  const text = dom.outputBox().textContent ?? "";
  if (!btn || !text.trim() || !navigator.clipboard) return;
  try {
    await navigator.clipboard.writeText(text);
    const prev = btn.textContent;
    btn.textContent = "已复制";
    window.setTimeout(() => {
      btn.textContent = prev || "复制结果";
    }, 1500);
  } catch {
    btn.textContent = "复制受限";
  }
}

dom.btnLocal().addEventListener("click", () => void handleLocalRedactAndExtract());
dom.btnPing().addEventListener("click", () => void handlePing());
dom.btnCloud().addEventListener("click", () => void handleCloudCompare());
dom.btnSampleMedical().addEventListener("click", () => fillSample("medical", "病历样例"));
dom.btnSampleReceipt().addEventListener("click", () => fillSample("receipt", "票据样例"));
dom.btnQuickMedical()?.addEventListener("click", () => void runQuickDemo("medical"));
dom.btnQuickReceipt()?.addEventListener("click", () => void runQuickDemo("receipt"));
dom.btnCopyOutput()?.addEventListener("click", () => void handleCopyOutput());

renderMemoryCount(0);
void lastRedaction;
void init();
