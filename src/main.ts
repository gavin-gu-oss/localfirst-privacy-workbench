import "./style.css";
import {
  checkOnDeviceAvailability,
  getActiveNanoLanguage,
  promptOnDevice,
  type NanoAvailability,
} from "./ondevice";
import { isCloudConfigured, runCrossDocCompare, runFirebaseAI } from "./cloud";
import {
  createRedactSession,
  redactText,
  restoreText,
  type RedactResult,
  type RedactSessionState,
} from "./redact";
import {
  dom,
  SAMPLES,
  renderCloudBadge,
  renderCloudPreview,
  renderComparePane,
  renderDegradedPanel,
  renderLatency,
  renderLocalBadge,
  renderMemoryDocs,
  renderOutput,
  renderOutputMode,
  renderPipelineStep,
  renderPrivacyBadge,
  renderRedactLatency,
  renderRedactSummary,
  renderRestoreControls,
  renderState,
  setCloudBusy,
  setLocalBusy,
  type AppState,
  type CachedDocMeta,
} from "./ui";

let state: AppState = "INIT";
let nanoStatus: NanoAvailability = "unsupported";

// Memory-only redaction session: never persisted to storage or sent over network.
let redactSession: RedactSessionState = createRedactSession();
const redactedDocsMemory: CachedDocMeta[] = [];
let nextDocId = 1;

// Current output tracking (for local restore toggle & redacted-only clipboard copy)
let currentRedactedOutputText = "";
let currentRestorable = false;
let isRestoredView = false;

// Pending cloud confirmation action & last retryable action
type PendingCloudAction =
  | { kind: "compare"; docs: string[] }
  | { kind: "fallback_extract"; raw: string; redaction: RedactResult; prompt: string };

let pendingCloudAction: PendingCloudAction | null = null;
let lastFailedCloudAction: PendingCloudAction | null = null;

function transition(next: AppState): void {
  state = next;
  renderState(state);
}

function getCustomTerms(): string[] {
  const raw = dom.customTerms()?.value ?? "";
  if (!raw.trim()) return [];
  return raw
    .split(/[,，、;\n]+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 2);
}

function inferDocTitle(raw: string): string {
  if (/门诊病历|病历记录|初步诊断|Outpatient/i.test(raw)) return "门诊病历";
  if (/报销票据|消费明细|商户名称|Receipt/i.test(raw)) return "报销票据";
  const firstLine = raw.split(/\n/)[0].trim().slice(0, 10);
  return firstLine || "脱敏文档";
}

function rememberRedactedDoc(raw: string, res: RedactResult): void {
  if (!res.redacted) return;
  if (redactedDocsMemory.some((d) => d.redactedText === res.redacted)) return;
  redactedDocsMemory.push({
    id: nextDocId++,
    title: inferDocTitle(raw),
    redactedCount: Object.keys(res.mapping).length,
    redactedText: res.redacted,
  });
  if (redactedDocsMemory.length > 5) redactedDocsMemory.shift();
  renderMemoryDocs(redactedDocsMemory);
}

function updateLocalButtonLabel(): void {
  const btn = dom.btnLocal();
  if (nanoStatus === "available") {
    btn.textContent = "本地脱敏 + 提炼 · Local Nano";
  } else if (nanoStatus === "downloadable" || nanoStatus === "downloading") {
    btn.textContent = "本地脱敏 + 下载提炼 · Local Nano";
  } else if (isCloudConfigured()) {
    btn.textContent = "本地脱敏 + 云端提炼（仅发脱敏文本）";
  } else {
    btn.textContent = "仅执行本地脱敏 · Local Redact Only";
  }
}

function refreshLocalBadge(): void {
  const guide = dom.nanoSetupGuide();
  if (nanoStatus === "available") {
    const langTag = getActiveNanoLanguage() === "zh" ? "zh" : "en";
    renderLocalBadge("local", `端侧 Nano 就绪 · On-Device (${langTag})`);
    if (guide) guide.hidden = true;
  } else if (nanoStatus === "downloadable") {
    renderLocalBadge("warn", "Nano 需先下载模型 · Download Needed");
    if (guide) guide.hidden = false;
  } else if (nanoStatus === "downloading") {
    renderLocalBadge("warn", "Nano 模型下载中 · Downloading");
    if (guide) guide.hidden = false;
  } else {
    renderLocalBadge("warn", "端侧 Nano 未就绪 · Local Redact Only");
    if (guide) guide.hidden = false;
  }
  updateLocalButtonLabel();
}

function refreshCloudBadge(override?: { tone: "local" | "cloud" | "warn" | "idle"; text: string }): void {
  if (override) {
    renderCloudBadge(override.tone, override.text);
    return;
  }
  if (!isCloudConfigured()) {
    renderCloudBadge("idle", "云端未配置 · Cloud Unconfigured");
    return;
  }
  if (!navigator.onLine) {
    renderCloudBadge("warn", "当前离线 · Cloud Offline");
    return;
  }
  renderCloudBadge("cloud", "云端就绪 · Cloud Ready");
}

function setDisplayedOutput(redactedText: string, restorable: boolean): void {
  currentRedactedOutputText = redactedText;
  currentRestorable = restorable && Object.keys(redactSession.mapping).length > 0;
  isRestoredView = false;
  renderRestoreControls(currentRestorable, false);
  renderOutput(redactedText);
}

function handleToggleRestore(): void {
  if (!currentRestorable || !currentRedactedOutputText) return;
  isRestoredView = !isRestoredView;
  renderRestoreControls(true, isRestoredView);
  if (isRestoredView) {
    const restored = restoreText(currentRedactedOutputText, redactSession.mapping);
    const restoredOriginals = Object.keys(redactSession.mapping).filter((orig) =>
      restored.includes(orig)
    );
    renderOutput(restored, { highlightRestoredTerms: restoredOriginals });
  } else {
    renderOutput(currentRedactedOutputText);
  }
}

function buildExtractPrompt(redactedText: string): string {
  return [
    "从以下已脱敏文本提炼恰好 3 条中文核心要点，每条不超过 22 字。",
    "只输出要点，不解释、不重复原文；每条一行，格式「要点：内容」，保留方括号占位符（如 [姓名1]）。",
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
  cloudBadge: string;
  title: string;
  reason: string;
  steps: string[];
  techDetail: string;
  canRetry: boolean;
}

function classifyCloudError(err: unknown): CloudErrorInfo {
  const raw = err instanceof Error ? err.message : String(err);

  if (!navigator.onLine || /failed to fetch|network|offline|err_internet/i.test(raw)) {
    return {
      cloudBadge: "当前离线 · Cloud Offline",
      title: "当前处于离线状态 · 云端分析已安全降级",
      reason: "浏览器当前无法连接网络，云端请求未发出；您的本地脱敏与端侧 Nano 提炼完全不受断网影响。",
      steps: [
        "可继续在离线状态下使用「本地脱敏 + 提炼 · Local Nano」。",
        "恢复网络连接后，直接点击右侧「立即重试 · Retry Cloud」即可完成跨文档对比。",
      ],
      techDetail: `Error: ${raw}`,
      canRetry: true,
    };
  }
  if (/超时|timeout|abort/i.test(raw)) {
    return {
      cloudBadge: "云端超时 · Timeout",
      title: "云端响应超时（> 20 秒）· 本地能力不受影响",
      reason: "云端模型在限定时间内未返回结果，请求已自动中止，避免阻塞本地工作台。",
      steps: [
        "可继续使用本地脱敏与端侧 Nano 功能。",
        "网络平稳后点击「立即重试 · Retry Cloud」重新发起分析。",
      ],
      techDetail: `Timeout Error: ${raw}`,
      canRetry: true,
    };
  }
  if (/401|app[\s_-]?check|unauthenticated/i.test(raw)) {
    return {
      cloudBadge: "身份校验未通过 (401)",
      title: "云端身份校验未通过 · 本地脱敏不受影响",
      reason: "云端安全校验暂未放行本次请求，请刷新页面或稍后重试；本地脱敏与端侧 Nano 仍可正常使用。",
      steps: [
        "刷新页面后再次点击「立即重试 · Retry Cloud」。",
        "离线或校验受限期间，可继续使用端侧本地脱敏与 Nano 提炼。",
      ],
      techDetail: `HTTP 401 / App Check: ${raw}\nDeveloper note: verify VITE_FIREBASE_APPCHECK_SITE_KEY (reCAPTCHA v3) or register a local debug token via VITE_FIREBASE_APPCHECK_DEBUG_TOKEN.`,
      canRetry: true,
    };
  }
  if (/403|permission_denied|forbidden|api.*not enabled|referer/i.test(raw)) {
    return {
      cloudBadge: "云端权限受限 (403)",
      title: "云端服务权限受限 (HTTP 403) · 本地能力不受影响",
      reason: "当前域名或项目尚未获得云端接口调用权限（可能是 API 未启用或 Referrer 限制）。",
      steps: [
        "本地脱敏与端侧 Nano 提炼完全不受影响，可继续使用。",
        "请联系部署管理员确认 Firebase AI Logic API 与域名白名单配置。",
      ],
      techDetail: `HTTP 403 / Forbidden: ${raw}`,
      canRetry: true,
    };
  }
  if (/404|not_found|model.*not found/i.test(raw)) {
    return {
      cloudBadge: "模型不可用 (404)",
      title: "指定的云端模型暂不可用 (HTTP 404)",
      reason: "当前配置的云端模型名称无法访问，本地脱敏能力保持正常。",
      steps: [
        "请确认 .env.local 中的 VITE_FIREBASE_CLOUD_MODEL 配置（默认 gemini-3.5-flash-lite）。",
        "本地脱敏与端侧 Nano 提炼仍可继续使用。",
      ],
      techDetail: `HTTP 404 / Model Not Found: ${raw}`,
      canRetry: false,
    };
  }
  if (/429|quota|rate[\s_-]?limit|resource_exhausted/i.test(raw)) {
    return {
      cloudBadge: "配额受限 (429)",
      title: "云端调用配额已达上限 (HTTP 429)",
      reason: "短时间内云端请求次数较多，请稍候再试；本地脱敏与端侧 Nano 无配额限制。",
      steps: [
        "等待片刻后点击「立即重试 · Retry Cloud」。",
        "日常单文档处理可继续使用端侧本地脱敏与 Nano 提炼。",
      ],
      techDetail: `HTTP 429 / Quota Exhausted: ${raw}`,
      canRetry: true,
    };
  }
  if (/尚未配置|\.env\.local/i.test(raw)) {
    return {
      cloudBadge: "云端未配置",
      title: "Firebase 云端尚未配置 · 本地能力正常可用",
      reason: "尚未在 .env.local 填入 Firebase Web App 配置，因此云端跨文档分析暂未启用。",
      steps: [
        "可直接使用「本地脱敏 + 提炼 · Local Nano」体验完整的离线本地处理。",
        "如需启用云端对比，请参考 README 配置 .env.local 后重启服务。",
      ],
      techDetail: `Config: ${raw}`,
      canRetry: false,
    };
  }
  return {
    cloudBadge: "云端暂不可用",
    title: "云端深度分析暂时不可用 · 本地脱敏不受影响",
    reason: "云端请求未成功完成，但原始敏感信息未离开本机，本地脱敏能力保持正常。",
    steps: [
      "可继续使用端侧本地脱敏与 Nano 提炼。",
      "稍后点击「立即重试 · Retry Cloud」重新尝试。",
    ],
    techDetail: `Error: ${raw}`,
    canRetry: true,
  };
}

function formatLocalResult(redaction: RedactResult, summary: string, note?: string): string {
  const count = Object.keys(redaction.mapping).length;
  const lines = [
    `【脱敏后文本】（本地替换 ${count} 项 · 耗时 ${redaction.latencyMs.toFixed(2)} ms · 映射仅存内存）`,
    redaction.redacted,
    "",
    "【提炼要点】",
    normalizeBullets(summary),
  ];
  if (note) {
    lines.push("", `说明：${note}`);
  }
  return lines.join("\n");
}

function readyStateForCurrentEnv(): AppState {
  if (nanoStatus === "available") return "READY_LOCAL";
  if (nanoStatus === "downloadable" || nanoStatus === "downloading") return "READY_DOWNLOADABLE";
  return "READY_LOCAL_REDACT_ONLY";
}

async function init(): Promise<void> {
  transition("INIT");
  nanoStatus = await checkOnDeviceAvailability();
  refreshLocalBadge();
  refreshCloudBadge();
  renderPrivacyBadge("local", "数据未离开本机 · Data stays local");
  transition(readyStateForCurrentEnv());
}

async function handleLocalRedactAndExtract(): Promise<void> {
  const raw = dom.inputText().value.trim();
  if (!raw) {
    renderOutput("请先粘贴文本，或点击上方「一键演示」/样例开始本地脱敏。");
    return;
  }

  renderCloudPreview(false);
  renderDegradedPanel(null);
  pendingCloudAction = null;

  setLocalBusy(true);
  let redaction: RedactResult | null = null;
  try {
    // 1. Always run deterministic local redaction FIRST (sub-millisecond, zero network)
    redaction = redactText(raw, redactSession, getCustomTerms());
    rememberRedactedDoc(raw, redaction);
    renderRedactLatency(redaction.latencyMs);
    renderRedactSummary(redaction.mapping, redaction.latencyMs);
    renderComparePane(raw, redaction.redacted);
    renderPrivacyBadge("local", "数据未离开本机 · Data stays local");

    const prompt = buildExtractPrompt(redaction.redacted);

    // 2. Primary path: On-device Gemini Nano via Chrome Prompt API
    if (nanoStatus === "available" || nanoStatus === "downloadable" || nanoStatus === "downloading") {
      transition("RUNNING_LOCAL");
      renderPipelineStep("local");
      renderLocalBadge("local", "端侧 Nano 推理中 · Running...");
      const res = await promptOnDevice(prompt, (pct) =>
        renderLocalBadge("warn", `Nano 模型下载中 ${pct}%`)
      );
      nanoStatus = "available";
      refreshLocalBadge();
      renderLatency("on_device", res.latencyMs);
      renderOutputMode("端侧输出 · On-Device Nano", "local");
      renderPipelineStep("local_done");
      setDisplayedOutput(formatLocalResult(redaction, res.text), true);
      transition("READY_LOCAL");
      return;
    }

    // 3. Nano unavailable: display local redaction immediately (never hide it!), then ask explicit consent before cloud fallback
    renderPipelineStep("local_only_done");
    if (!isCloudConfigured()) {
      renderOutputMode("本地脱敏完成 · Local Redact Only", "local");
      setDisplayedOutput(
        [
          `【脱敏后文本】（本地替换 ${Object.keys(redaction.mapping).length} 项 · 耗时 ${redaction.latencyMs.toFixed(2)} ms · 映射仅存内存）`,
          redaction.redacted,
          "",
          "提示：当前浏览器未启用端侧 Gemini Nano 且未配置云端，已完成 100% 本地脱敏。展开上方「启用指南」可开启离线 Nano 提炼。",
        ].join("\n"),
        true
      );
      transition("READY_LOCAL_REDACT_ONLY");
      return;
    }

    renderOutputMode("本地脱敏完成 · 待确认云端回退", "local");
    setDisplayedOutput(
      [
        `【脱敏后文本】（本地替换 ${Object.keys(redaction.mapping).length} 项 · 耗时 ${redaction.latencyMs.toFixed(2)} ms · 映射仅存内存）`,
        redaction.redacted,
        "",
        "端侧 Nano 当前未就绪。如需使用云端 Gemini 提炼要点，请在上方预览脱敏文本并点击「确认仅发送脱敏文本」。",
      ].join("\n"),
      true
    );
    pendingCloudAction = { kind: "fallback_extract", raw, redaction, prompt };
    renderCloudPreview(
      true,
      "端侧 Nano 未就绪 · 云端回退提炼内容预览（仅发送以下脱敏文本）",
      [redaction.redacted]
    );
    transition("READY_LOCAL_REDACT_ONLY");
  } catch (err) {
    transition("ERROR");
    refreshLocalBadge();
    const errMsg = err instanceof Error ? err.message : String(err);
    if (redaction) {
      // M7: Never hide already-completed local redaction when Nano inference fails!
      renderPipelineStep("local_only_done");
      renderOutputMode("本地已脱敏 · Nano 提炼失败", "warn");
      setDisplayedOutput(
        [
          `【脱敏后文本】（本地替换 ${Object.keys(redaction.mapping).length} 项 · 耗时 ${redaction.latencyMs.toFixed(2)} ms · 映射仅存内存）`,
          redaction.redacted,
          "",
          `【端侧提炼未完成】${errMsg}`,
          "本地脱敏结果已保留并缓存在内存中，不受本次提炼失败影响。",
        ].join("\n"),
        true
      );
    } else {
      renderOutputMode("本地处理受阻", "warn");
      setDisplayedOutput(`错误：${errMsg}`, false);
    }
  } finally {
    setLocalBusy(false);
  }
}

async function handlePing(): Promise<void> {
  setLocalBusy(true);
  renderCloudPreview(false);
  renderDegradedPanel(null);
  try {
    if (nanoStatus !== "available" && nanoStatus !== "downloadable") {
      throw new Error(`当前端侧 Nano 未就绪（状态：${nanoStatus}）。请展开上方指南启用 Chrome Flags。`);
    }
    transition("RUNNING_LOCAL");
    renderPipelineStep("local");
    renderLocalBadge("local", "端侧 Nano 自检中...");
    const res = await promptOnDevice(
      "Reply concisely in 6 words: Local Gemini Nano is ready offline.",
      (pct) => renderLocalBadge("warn", `Nano 模型下载中 ${pct}%`)
    );
    nanoStatus = "available";
    refreshLocalBadge();
    renderLatency("on_device", res.latencyMs);
    renderRedactSummary(null);
    renderComparePane(null, null);
    renderPrivacyBadge("local", "数据未离开本机 · Data stays local");
    renderOutputMode("端侧自检通过 · Nano Ready", "local");
    renderPipelineStep("local_done");
    setDisplayedOutput(`【端侧连通性自检通过】（Prompt API 语言参数：${res.language}）\n${res.text}`, false);
    transition("READY_LOCAL");
  } catch (err) {
    transition("ERROR");
    refreshLocalBadge();
    renderOutputMode("端侧自检未通过", "warn");
    setDisplayedOutput(`端侧自检未通过：${err instanceof Error ? err.message : String(err)}`, false);
  } finally {
    setLocalBusy(false);
  }
}

function collectDocsForCloudCompare(): string[] {
  const raw = dom.inputText().value.trim();
  const terms = getCustomTerms();

  if (raw) {
    for (const part of raw.split(/\n-{3,}\n/)) {
      const trimmed = part.trim();
      if (!trimmed) continue;
      const res = redactText(trimmed, redactSession, terms);
      renderRedactLatency(res.latencyMs);
      rememberRedactedDoc(trimmed, res);
    }
  }

  return redactedDocsMemory.map((d) => d.redactedText);
}

function handleCloudCompareRequest(): void {
  renderDegradedPanel(null);
  const docs = collectDocsForCloudCompare();
  if (docs.length === 0) {
    setDisplayedOutput(
      "请先输入文本或点击上方「一键演示」/样例运行本地脱敏，再发起云端深度分析。",
      false
    );
    return;
  }

  pendingCloudAction = { kind: "compare", docs };
  renderComparePane(null, null);
  renderCloudPreview(
    true,
    `即将发送至云端的内容预览（共 ${docs.length} 份，仅含脱敏占位符 · Cloud Payload Preview）`,
    docs
  );
  renderOutputMode(`待确认发送 (${docs.length} 份脱敏文本)`, "cloud");
}

async function executeCloudAction(action: PendingCloudAction): Promise<void> {
  renderCloudPreview(false);
  renderDegradedPanel(null);
  pendingCloudAction = null;
  setCloudBusy(true);

  if (action.kind === "compare") {
    const { docs } = action;
    transition("RUNNING_CLOUD");
    renderPipelineStep("cloud");
    refreshCloudBadge({ tone: "cloud", text: "云端 Gemini 分析中..." });
    renderPrivacyBadge("cloud", `云端仅接收 ${docs.length} 份脱敏文本 · Redacted Only`);

    const t0 = performance.now();
    try {
      const report = await runCrossDocCompare(docs);
      const latencyMs = Math.round(performance.now() - t0);
      lastFailedCloudAction = null;
      renderLatency("in_cloud", latencyMs);
      refreshCloudBadge({ tone: "cloud", text: "Cloud Gemini (Firebase AI)" });
      renderPrivacyBadge("cloud", `云端仅接收 ${docs.length} 份脱敏文本 · Redacted Only`);
      renderRedactSummary(null);
      renderComparePane(null, null);
      renderOutputMode(
        docs.length >= 2 ? `云端跨文档报告 · ${docs.length} 份` : "云端深度报告 · 1 份",
        "cloud"
      );
      renderPipelineStep("cloud_done");
      const header =
        docs.length >= 2
          ? `【云端跨文档对比报告】（已发送 ${docs.length} 份本地脱敏文本 · 可点击右上角「在本地还原真名」）`
          : "【云端深度分析报告】（已发送 1 份本地脱敏文本 · 可点击右上角「在本地还原真名」）";
      setDisplayedOutput(`${header}\n\n${report.trim()}`, true);
      transition(readyStateForCurrentEnv());
    } catch (err) {
      const info = classifyCloudError(err);
      lastFailedCloudAction = action;
      transition("DEGRADED");
      // M5: Keep local Nano badge healthy; only cloud badge degrades!
      refreshLocalBadge();
      refreshCloudBadge({ tone: "warn", text: info.cloudBadge });
      renderPrivacyBadge("local", "云端受阻 · 原始隐私未离开本机");
      renderOutputMode("云端已安全降级 · Local OK", "warn");
      renderPipelineStep("cloud_degraded");
      renderDegradedPanel({
        title: info.title,
        reason: info.reason,
        statusLine: `内存已为您保留 ${docs.length} 份本地脱敏文档，无需重新输入。`,
        steps: info.steps,
        techDetail: info.techDetail,
        canRetry: info.canRetry,
      });
      setDisplayedOutput(
        `【云端已安全降级】${info.title}\n已保留 ${docs.length} 份内存脱敏文档；本地脱敏与端侧 Nano 提炼完全不受影响。`,
        false
      );
    } finally {
      setCloudBusy(false);
    }
    return;
  }

  // Fallback single-document extraction via Firebase AI Logic (explicit user confirmed)
  const { redaction, prompt } = action;
  transition("FALLBACK_CLOUD");
  renderPipelineStep("local_fallback");
  refreshCloudBadge({ tone: "cloud", text: "Cloud Gemini 回退提炼中..." });
  renderPrivacyBadge("cloud", "云端仅接收 1 份脱敏文本 · Redacted Only");
  try {
    const res = await runFirebaseAI(prompt, true);
    lastFailedCloudAction = null;
    renderLatency(res.source, res.latencyMs);
    refreshCloudBadge({
      tone: res.source === "on_device" ? "local" : "cloud",
      text: res.source === "on_device" ? "On-Device Nano (SDK)" : "Cloud Gemini (Firebase AI)",
    });
    renderOutputMode(
      res.source === "on_device" ? "端侧输出 · Nano (SDK)" : "云端回退提炼 · Cloud Gemini",
      res.source === "on_device" ? "local" : "cloud"
    );
    renderPipelineStep(res.source === "on_device" ? "local_done" : "local_fallback_done");
    setDisplayedOutput(
      formatLocalResult(
        redaction,
        res.text,
        res.source === "in_cloud" ? "本次提炼经确认后仅发送脱敏文本至云端完成。" : undefined
      ),
      true
    );
    transition(readyStateForCurrentEnv());
  } catch (err) {
    const info = classifyCloudError(err);
    lastFailedCloudAction = action;
    transition("DEGRADED");
    refreshLocalBadge();
    refreshCloudBadge({ tone: "warn", text: info.cloudBadge });
    renderPrivacyBadge("local", "云端受阻 · 本地脱敏已完成");
    renderOutputMode("本地已脱敏 · 云端降级", "warn");
    renderPipelineStep("cloud_degraded");
    renderDegradedPanel({
      title: info.title,
      reason: info.reason,
      statusLine: `本地脱敏已完成并缓存在内存（当前共 ${redactedDocsMemory.length} 份）。`,
      steps: info.steps,
      techDetail: info.techDetail,
      canRetry: info.canRetry,
    });
    setDisplayedOutput(
      `【脱敏后文本】（本地替换 ${Object.keys(redaction.mapping).length} 项 · 映射仅存内存）\n${redaction.redacted}`,
      true
    );
  } finally {
    setCloudBusy(false);
  }
}

function handleClearMemory(): void {
  redactedDocsMemory.length = 0;
  nextDocId = 1;
  redactSession = createRedactSession();
  pendingCloudAction = null;
  lastFailedCloudAction = null;
  renderMemoryDocs(redactedDocsMemory);
  renderRedactSummary(null);
  renderComparePane(null, null);
  renderCloudPreview(false);
  renderDegradedPanel(null);
  renderRestoreControls(false, false);
  renderPipelineStep("idle");
  renderOutputMode("内存已清空 · Cleared", "idle");
  renderPrivacyBadge("local", "数据未离开本机 · Data stays local");
  setDisplayedOutput("已清空内存中的脱敏文档缓存与占位符映射表。", false);
}

function fillSample(kind: keyof typeof SAMPLES, label: string): void {
  dom.inputText().value = SAMPLES[kind];
  renderRedactSummary(null);
  renderComparePane(null, null);
  renderCloudPreview(false);
  renderDegradedPanel(null);
  renderOutputMode("已填入样例", "idle");
  setDisplayedOutput(
    `已填入${label}（虚构演示数据，映射表仅存内存）。点击「本地脱敏 + 提炼」开始处理。`,
    false
  );
}

async function runQuickDemo(kind: keyof typeof SAMPLES): Promise<void> {
  dom.inputText().value = SAMPLES[kind];
  await handleLocalRedactAndExtract();
}

async function handleCopyOutput(): Promise<void> {
  const btn = dom.btnCopyOutput();
  // Always copy redacted (placeholder) text so real PII isn't accidentally leaked to clipboard!
  const textToCopy = currentRedactedOutputText || (dom.outputBox().textContent ?? "");
  if (!btn || !textToCopy.trim() || !navigator.clipboard) return;
  const prev = "复制脱敏结果";
  try {
    await navigator.clipboard.writeText(textToCopy);
    btn.textContent = "已复制（仅含脱敏文本）";
    window.setTimeout(() => {
      btn.textContent = prev;
    }, 1800);
  } catch {
    btn.textContent = "复制受限";
    window.setTimeout(() => {
      btn.textContent = prev;
    }, 1800);
  }
}

// Network listeners (M5): automatically reflect offline/online state on Cloud badge without affecting Local badge
window.addEventListener("offline", () => {
  refreshCloudBadge({ tone: "warn", text: "当前离线 · Cloud Offline" });
  renderPrivacyBadge("local", "已离线 · 端侧零外发正常运行");
});

window.addEventListener("online", () => {
  if (lastFailedCloudAction) {
    refreshCloudBadge({ tone: "cloud", text: "云端已恢复 · 点击重试" });
  } else {
    refreshCloudBadge();
  }
});

dom.btnLocal().addEventListener("click", () => void handleLocalRedactAndExtract());
dom.btnPing().addEventListener("click", () => void handlePing());
dom.btnCloud().addEventListener("click", () => handleCloudCompareRequest());
dom.btnSampleMedical().addEventListener("click", () => fillSample("medical", "病历样例"));
dom.btnSampleReceipt().addEventListener("click", () => fillSample("receipt", "票据样例"));
dom.btnSampleEn()?.addEventListener("click", () => fillSample("english", "English Receipt Sample"));
dom.btnQuickMedical()?.addEventListener("click", () => void runQuickDemo("medical"));
dom.btnQuickReceipt()?.addEventListener("click", () => void runQuickDemo("receipt"));
dom.btnClearMemory()?.addEventListener("click", () => handleClearMemory());
dom.btnCopyOutput()?.addEventListener("click", () => void handleCopyOutput());
dom.btnRestoreToggle()?.addEventListener("click", () => handleToggleRestore());
dom.btnConfirmCloud()?.addEventListener("click", () => {
  if (pendingCloudAction) void executeCloudAction(pendingCloudAction);
});
dom.btnCancelCloud()?.addEventListener("click", () => {
  pendingCloudAction = null;
  renderCloudPreview(false);
  renderOutputMode("已取消云端发送", "idle");
});
dom.btnRetryCloud()?.addEventListener("click", () => {
  if (lastFailedCloudAction) void executeCloudAction(lastFailedCloudAction);
});

renderMemoryDocs(redactedDocsMemory);
void init();
