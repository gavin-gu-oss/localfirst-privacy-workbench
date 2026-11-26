export type BadgeTone = "idle" | "local" | "cloud" | "warn";

export type PipelineStage =
  | "idle"
  | "local"
  | "local_done"
  | "local_only_done"
  | "local_fallback"
  | "local_fallback_done"
  | "cloud"
  | "cloud_done"
  | "cloud_degraded";

export type AppState =
  | "INIT"
  | "READY_LOCAL"
  | "READY_DOWNLOADABLE"
  | "READY_LOCAL_REDACT_ONLY"
  | "RUNNING_LOCAL"
  | "RUNNING_CLOUD"
  | "FALLBACK_CLOUD"
  | "DEGRADED"
  | "ERROR";

export interface CachedDocMeta {
  id: number;
  title: string;
  redactedCount: number;
  redactedText: string;
}

const byId = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing DOM element: #${id}`);
  return el as T;
};

const optById = <T extends HTMLElement>(id: string): T | null =>
  document.getElementById(id) as T | null;

export const SAMPLES = {
  medical:
    "门诊病历记录：患者姓名：张三，男，36岁，身份证号：110101199001011234，联系电话：13800138000，居住地址：北京市朝阳区建国路88号3号楼502室，电子邮箱：zhangsan_demo@example.com。2026年11月18日就诊于北京协和医院呼吸内科，主诉反复咳嗽伴低热4天。初步诊断：急性支气管炎。处方用药：阿莫西林胶囊0.5g每日三次，复方甘草口服溶液10ml每日三次，嘱多饮水、一周后复诊，本次门诊费用合计328.50元。",
  receipt:
    "医疗及消费报销票据：持卡人：李明，手机号：13900139000，付款银行卡号：6222021001123456789，收件地址：上海市浦东新区张江路666号201室。消费日期：2026年11月20日，商户名称：上海仁济大药房张江分店。消费明细：阿莫西林胶囊（处方西药续购）215.00元、医用口罩及体温计68.00元、健康体检挂号费150.00元，实付总金额：443.00元。备注：关联2026年11月18日急性支气管炎门诊报销；已开具电子普通发票，用于年底医保与商业险二次核销。",
  english:
    "Outpatient Visit Receipt: Patient Name: Alice Johnson, SSN: 123-45-6789, Phone: (415) 555-0192, Email: alice.j@example.com, Address: 742 Evergreen Ave, San Francisco, CA. Date: 2026-11-20. Clinic: Bay Area General Hospital. Diagnosis: Acute Bronchitis. Prescription: Amoxicillin 500mg TID. Itemized Charges: Consultation $160.00, Lab Panel $55.00, Medication $25.00. Total Paid: $240.00.",
} as const;

export const dom = {
  engineBadge: () => byId<HTMLSpanElement>("engine-badge"),
  cloudBadge: () => optById<HTMLSpanElement>("cloud-badge"),
  privacyBadge: () => byId<HTMLSpanElement>("privacy-badge"),
  latencyRedact: () => optById<HTMLElement>("latency-redact"),
  latencyLocal: () => byId<HTMLElement>("latency-ondevice"),
  latencyCloud: () => byId<HTMLElement>("latency-cloud"),
  stateLabel: () => byId<HTMLElement>("state-label"),
  stateHint: () => optById<HTMLElement>("state-hint"),
  outputBox: () => byId<HTMLElement>("output-box"),
  inputText: () => byId<HTMLTextAreaElement>("input-text"),
  customTerms: () => optById<HTMLInputElement>("custom-terms"),
  btnLocal: () => byId<HTMLButtonElement>("btn-ondevice"),
  btnCloud: () => byId<HTMLButtonElement>("btn-cloud"),
  btnPing: () => byId<HTMLButtonElement>("btn-ping"),
  btnSampleMedical: () => byId<HTMLButtonElement>("btn-sample-medical"),
  btnSampleReceipt: () => byId<HTMLButtonElement>("btn-sample-receipt"),
  btnSampleEn: () => optById<HTMLButtonElement>("btn-sample-en"),
  btnQuickMedical: () => optById<HTMLButtonElement>("btn-quick-medical"),
  btnQuickReceipt: () => optById<HTMLButtonElement>("btn-quick-receipt"),
  btnClearMemory: () => optById<HTMLButtonElement>("btn-clear-memory"),
  btnCopyOutput: () => optById<HTMLButtonElement>("btn-copy-output"),
  btnRestoreToggle: () => optById<HTMLButtonElement>("btn-restore-toggle"),
  memoryBadge: () => optById<HTMLSpanElement>("memory-badge"),
  memoryDocsList: () => optById<HTMLDivElement>("memory-docs-list"),
  outputModePill: () => optById<HTMLSpanElement>("output-mode-pill"),
  redactSummary: () => optById<HTMLDivElement>("redact-summary"),
  restoreBanner: () => optById<HTMLDivElement>("restore-banner"),
  comparePane: () => optById<HTMLDivElement>("compare-pane"),
  compareRaw: () => optById<HTMLDivElement>("compare-raw"),
  compareRedacted: () => optById<HTMLDivElement>("compare-redacted"),
  cloudPreviewPanel: () => optById<HTMLDivElement>("cloud-preview-panel"),
  cloudPreviewTitle: () => optById<HTMLElement>("cloud-preview-title"),
  cloudPreviewBody: () => optById<HTMLDivElement>("cloud-preview-body"),
  btnConfirmCloud: () => optById<HTMLButtonElement>("btn-confirm-cloud"),
  btnCancelCloud: () => optById<HTMLButtonElement>("btn-cancel-cloud"),
  degradedPanel: () => optById<HTMLDivElement>("degraded-panel"),
  degradedTitle: () => optById<HTMLElement>("degraded-title"),
  degradedReason: () => optById<HTMLElement>("degraded-reason"),
  degradedStatus: () => optById<HTMLElement>("degraded-status"),
  degradedSteps: () => optById<HTMLUListElement>("degraded-steps"),
  degradedTech: () => optById<HTMLElement>("degraded-tech"),
  btnRetryCloud: () => optById<HTMLButtonElement>("btn-retry-cloud"),
  nanoSetupGuide: () => optById<HTMLDetailsElement>("nano-setup-guide"),
  stepRedact: () => optById<HTMLDivElement>("step-redact"),
  stepNano: () => optById<HTMLDivElement>("step-nano"),
  stepCloud: () => optById<HTMLDivElement>("step-cloud"),
};

const PLACEHOLDER_TOKEN_RE = /(\[[\u4e00-\u9fa5A-Za-z]+\d*\])/g;

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function setBadge(el: HTMLElement | null, tone: BadgeTone, text: string): void {
  if (!el) return;
  el.textContent = text;
  el.className = tone === "idle" ? "badge" : `badge badge-${tone}`;
}

export function renderLocalBadge(tone: BadgeTone, label: string): void {
  setBadge(dom.engineBadge(), tone, label);
}

export function renderCloudBadge(tone: BadgeTone, label: string): void {
  setBadge(dom.cloudBadge(), tone, label);
}

export function renderPrivacyBadge(tone: BadgeTone, label: string): void {
  setBadge(dom.privacyBadge(), tone, label);
}

const STATE_LABELS: Record<AppState, string> = {
  INIT: "检测中 · Checking",
  READY_LOCAL: "端侧就绪 · Ready (Local)",
  READY_DOWNLOADABLE: "需下载模型 · Download Needed",
  READY_LOCAL_REDACT_ONLY: "本地脱敏就绪 · Local Redact",
  RUNNING_LOCAL: "端侧推理中 · Running Local",
  RUNNING_CLOUD: "云端分析中 · Cloud Audit",
  FALLBACK_CLOUD: "云端回退中 · Cloud Fallback",
  DEGRADED: "云端受阻 · Local OK",
  ERROR: "操作受阻 · Needs Action",
};

const STATE_HINTS: Record<AppState, string> = {
  INIT: "正在检测端侧模型...",
  READY_LOCAL: "端侧 Nano 就绪，断网亦可用",
  READY_DOWNLOADABLE: "首次点击需联网下载本机模型",
  READY_LOCAL_REDACT_ONLY: "本地正则脱敏 100% 离线可用",
  RUNNING_LOCAL: "本机脱敏 + Gemini Nano 推理中",
  RUNNING_CLOUD: "仅发送脱敏占位符至云端分析中",
  FALLBACK_CLOUD: "经确认后发送脱敏文本至云端提炼",
  DEGRADED: "云端暂不可用，端侧与内存缓存不受影响",
  ERROR: "当前操作未完成，本地脱敏仍可继续",
};

export function renderState(state: AppState): void {
  dom.stateLabel().textContent = STATE_LABELS[state];
  const hint = dom.stateHint();
  if (hint) hint.textContent = STATE_HINTS[state];
}

export function renderPipelineStep(stage: PipelineStage): void {
  const s1 = dom.stepRedact();
  const s2 = dom.stepNano();
  const s3 = dom.stepCloud();
  if (!s1 || !s2 || !s3) return;
  for (const el of [s1, s2, s3]) el.classList.remove("is-active", "is-done", "is-warn");

  if (stage === "local") {
    s1.classList.add("is-done");
    s2.classList.add("is-active");
  } else if (stage === "local_done") {
    s1.classList.add("is-done");
    s2.classList.add("is-done");
  } else if (stage === "local_only_done") {
    s1.classList.add("is-done");
    s2.classList.add("is-warn");
  } else if (stage === "local_fallback") {
    s1.classList.add("is-done");
    s2.classList.add("is-warn");
    s3.classList.add("is-active");
  } else if (stage === "local_fallback_done") {
    s1.classList.add("is-done");
    s2.classList.add("is-warn");
    s3.classList.add("is-done");
  } else if (stage === "cloud") {
    s1.classList.add("is-done");
    s2.classList.add("is-done");
    s3.classList.add("is-active");
  } else if (stage === "cloud_done") {
    s1.classList.add("is-done");
    s2.classList.add("is-done");
    s3.classList.add("is-done");
  } else if (stage === "cloud_degraded") {
    s1.classList.add("is-done");
    s3.classList.add("is-warn");
  }
}

export function renderMemoryDocs(docs: CachedDocMeta[]): void {
  const count = docs.length;
  const badge = dom.memoryBadge();
  if (badge) {
    badge.textContent =
      count >= 2
        ? `内存缓存：${count} 份（可跨文档对比）`
        : `内存缓存：${count} 份`;
    badge.className = count > 0 ? "pill pill-local" : "pill";
  }

  const clearBtn = dom.btnClearMemory();
  if (clearBtn) clearBtn.disabled = count === 0;

  const list = dom.memoryDocsList();
  if (list) {
    list.replaceChildren();
    if (count === 0) {
      list.hidden = true;
    } else {
      const lead = document.createElement("span");
      lead.textContent = "内存已缓存（仅存脱敏副本）：";
      list.appendChild(lead);
      for (const doc of docs) {
        const tag = document.createElement("span");
        tag.className = "doc-tag";
        tag.textContent = `#${doc.id} ${doc.title} (${doc.redactedCount}项)`;
        list.appendChild(tag);
      }
      list.hidden = false;
    }
  }

  const cloudBtn = dom.btnCloud();
  if (count >= 2) {
    cloudBtn.textContent = `云端跨文档对比 (${count} 份) · Cloud Cross-Doc`;
  } else if (count === 1) {
    cloudBtn.textContent = "云端深度分析 (1 份) · Cloud Audit";
  } else {
    cloudBtn.textContent = "云端深度分析 · Cloud Audit";
  }
}

export function renderOutputMode(label: string, tone: BadgeTone): void {
  const el = dom.outputModePill();
  if (!el) return;
  el.textContent = label;
  el.className = tone === "idle" ? "pill" : `pill pill-${tone}`;
}

export function renderRedactSummary(
  mapping: Record<string, string> | null,
  latencyMs?: number
): void {
  const box = dom.redactSummary();
  if (!box) return;
  box.replaceChildren();
  const tokens = mapping ? Object.values(mapping) : [];
  if (tokens.length === 0) {
    box.hidden = true;
    return;
  }
  const counts = new Map<string, number>();
  for (const tok of tokens) {
    const label = tok.replace(/^\[([^\d\]]+)\d*\]$/, "[$1]");
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  const lead = document.createElement("span");
  const speed = typeof latencyMs === "number" ? ` · ${formatRedactMs(latencyMs)}` : "";
  lead.textContent = `本地已替换 ${tokens.length} 项（映射仅存内存${speed}）：`;
  box.appendChild(lead);
  for (const [label, n] of counts) {
    const chip = document.createElement("span");
    chip.className = "redact-chip";
    chip.textContent = `${label} ×${n}`;
    box.appendChild(chip);
  }
  box.hidden = false;
}

export function formatRedactMs(ms: number): string {
  if (ms < 0.01) return "< 0.01 ms";
  if (ms < 1) return `${ms.toFixed(2)} ms`;
  return `${ms.toFixed(1)} ms`;
}

export function formatModelLatency(ms: number): string {
  if (ms >= 1000) return `${(ms / 1000).toFixed(2)} s`;
  return `${Math.round(ms)} ms`;
}

export function renderRedactLatency(ms: number): void {
  const el = dom.latencyRedact();
  if (el) el.textContent = formatRedactMs(ms);
}

export function renderLatency(source: "on_device" | "in_cloud", ms: number): void {
  const target = source === "on_device" ? dom.latencyLocal() : dom.latencyCloud();
  target.textContent = formatModelLatency(ms);
}

export function renderHighlightedInto(
  container: HTMLElement,
  text: string,
  highlightTerms?: string[],
  highlightClass = "ph-mark"
): void {
  container.replaceChildren();
  let regex: RegExp | null = null;
  if (highlightTerms && highlightTerms.length > 0) {
    const cleaned = [...new Set(highlightTerms.filter(Boolean))].sort((a, b) => b.length - a.length);
    if (cleaned.length > 0) {
      regex = new RegExp(`(${cleaned.map(escapeRegExp).join("|")})`, "g");
    }
  } else {
    regex = PLACEHOLDER_TOKEN_RE;
  }

  if (!regex) {
    container.appendChild(document.createTextNode(text));
    return;
  }

  let lastIndex = 0;
  for (const match of text.matchAll(regex)) {
    const idx = match.index ?? 0;
    if (idx > lastIndex) {
      container.appendChild(document.createTextNode(text.slice(lastIndex, idx)));
    }
    const mark = document.createElement("mark");
    mark.className = highlightClass;
    mark.textContent = match[0];
    container.appendChild(mark);
    lastIndex = idx + match[0].length;
  }
  if (lastIndex < text.length) {
    container.appendChild(document.createTextNode(text.slice(lastIndex)));
  }
}

export function renderOutput(
  text: string,
  opts?: { highlightRestoredTerms?: string[] }
): void {
  const box = dom.outputBox();
  if (opts?.highlightRestoredTerms && opts.highlightRestoredTerms.length > 0) {
    renderHighlightedInto(box, text, opts.highlightRestoredTerms, "restored-mark");
  } else {
    renderHighlightedInto(box, text);
  }
}

export function renderComparePane(raw: string | null, redacted: string | null): void {
  const pane = dom.comparePane();
  const rawEl = dom.compareRaw();
  const redEl = dom.compareRedacted();
  if (!pane || !rawEl || !redEl) return;
  if (!raw || !redacted) {
    pane.hidden = true;
    rawEl.replaceChildren();
    redEl.replaceChildren();
    return;
  }
  rawEl.textContent = raw;
  renderHighlightedInto(redEl, redacted);
  pane.hidden = false;
}

export function renderRestoreControls(visible: boolean, restored: boolean): void {
  const btn = dom.btnRestoreToggle();
  const banner = dom.restoreBanner();
  if (btn) {
    btn.hidden = !visible;
    btn.textContent = restored
      ? "切回脱敏占位符 · Show Placeholders"
      : "在本地还原真名 · Local Restore";
    btn.classList.toggle("is-restored", restored);
  }
  if (banner) {
    banner.hidden = !(visible && restored);
  }
}

export function renderCloudPreview(
  visible: boolean,
  title?: string,
  docs?: string[]
): void {
  const panel = dom.cloudPreviewPanel();
  const titleEl = dom.cloudPreviewTitle();
  const bodyEl = dom.cloudPreviewBody();
  if (!panel || !titleEl || !bodyEl) return;
  if (!visible || !docs || docs.length === 0) {
    panel.hidden = true;
    bodyEl.replaceChildren();
    return;
  }
  titleEl.textContent =
    title ?? `即将发送至云端的内容预览（共 ${docs.length} 份，仅含脱敏占位符 · Cloud Payload Preview）`;
  const previewText = docs
    .map((d, i) => `【文档 ${i + 1}（已脱敏）】\n${d}`)
    .join("\n\n---\n\n");
  renderHighlightedInto(bodyEl, previewText);
  panel.hidden = false;
}

export function renderDegradedPanel(
  info: {
    title: string;
    reason: string;
    statusLine?: string;
    steps: string[];
    techDetail: string;
    canRetry: boolean;
  } | null
): void {
  const panel = dom.degradedPanel();
  if (!panel) return;
  if (!info) {
    panel.hidden = true;
    return;
  }
  const titleEl = dom.degradedTitle();
  const reasonEl = dom.degradedReason();
  const statusEl = dom.degradedStatus();
  const stepsEl = dom.degradedSteps();
  const techEl = dom.degradedTech();
  const retryBtn = dom.btnRetryCloud();

  if (titleEl) titleEl.textContent = info.title;
  if (reasonEl) reasonEl.textContent = info.reason;
  if (statusEl) {
    statusEl.textContent = info.statusLine ?? "";
    statusEl.hidden = !info.statusLine;
  }
  if (stepsEl) {
    stepsEl.replaceChildren();
    for (const s of info.steps) {
      const li = document.createElement("li");
      li.textContent = s;
      stepsEl.appendChild(li);
    }
  }
  if (techEl) techEl.textContent = info.techDetail;
  if (retryBtn) retryBtn.hidden = !info.canRetry;
  panel.hidden = false;
}

export function setLocalBusy(busy: boolean): void {
  dom.btnLocal().disabled = busy;
  dom.btnPing().disabled = busy;
  dom.btnSampleMedical().disabled = busy;
  dom.btnSampleReceipt().disabled = busy;
  const en = dom.btnSampleEn();
  if (en) en.disabled = busy;
  const qm = dom.btnQuickMedical();
  const qr = dom.btnQuickReceipt();
  if (qm) qm.disabled = busy;
  if (qr) qr.disabled = busy;
}

export function setCloudBusy(busy: boolean): void {
  dom.btnCloud().disabled = busy;
  const confirmBtn = dom.btnConfirmCloud();
  const retryBtn = dom.btnRetryCloud();
  if (confirmBtn) confirmBtn.disabled = busy;
  if (retryBtn) retryBtn.disabled = busy;
}
