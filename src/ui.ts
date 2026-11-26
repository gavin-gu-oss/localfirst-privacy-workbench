export type EngineMode = "idle" | "on_device" | "in_cloud" | "error";

export type PipelineStage =
  | "idle"
  | "local"
  | "local_done"
  | "cloud"
  | "cloud_done"
  | "cloud_degraded";

export type AppState =
  | "INIT"
  | "READY_LOCAL"
  | "READY_CLOUD_ONLY"
  | "RUNNING_LOCAL"
  | "RUNNING_CLOUD"
  | "FALLBACK_CLOUD"
  | "ERROR";

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
    "医疗及消费报销票据：持卡人：李明，手机号：13900139000，付款银行卡号：6222021001123456789，收件地址：上海市浦东新区张江路666号201室。消费日期：2026年11月20日，商户名称：上海仁济大药房张江分店。消费明细：处方西药费215.00元、医用口罩及体温计68.00元、健康体检挂号费150.00元，实付总金额：433.00元。发票状态：已开具电子普通发票，用于年底医保与商业险二次核销。",
} as const;

export const dom = {
  engineBadge: () => byId<HTMLSpanElement>("engine-badge"),
  privacyBadge: () => byId<HTMLSpanElement>("privacy-badge"),
  latencyLocal: () => byId<HTMLElement>("latency-ondevice"),
  latencyCloud: () => byId<HTMLElement>("latency-cloud"),
  stateLabel: () => byId<HTMLElement>("state-label"),
  outputBox: () => byId<HTMLPreElement>("output-box"),
  inputText: () => byId<HTMLTextAreaElement>("input-text"),
  btnLocal: () => byId<HTMLButtonElement>("btn-ondevice"),
  btnCloud: () => byId<HTMLButtonElement>("btn-cloud"),
  btnPing: () => byId<HTMLButtonElement>("btn-ping"),
  btnSampleMedical: () => byId<HTMLButtonElement>("btn-sample-medical"),
  btnSampleReceipt: () => byId<HTMLButtonElement>("btn-sample-receipt"),
  btnQuickMedical: () => optById<HTMLButtonElement>("btn-quick-medical"),
  btnQuickReceipt: () => optById<HTMLButtonElement>("btn-quick-receipt"),
  btnCopyOutput: () => optById<HTMLButtonElement>("btn-copy-output"),
  memoryBadge: () => optById<HTMLSpanElement>("memory-badge"),
  stateHint: () => optById<HTMLElement>("state-hint"),
  outputModePill: () => optById<HTMLSpanElement>("output-mode-pill"),
  redactSummary: () => optById<HTMLDivElement>("redact-summary"),
  stepRedact: () => optById<HTMLDivElement>("step-redact"),
  stepNano: () => optById<HTMLDivElement>("step-nano"),
  stepCloud: () => optById<HTMLDivElement>("step-cloud"),
};

export function renderEngineStatus(
  mode: EngineMode,
  label: string,
  privacyOverride?: string
): void {
  const badge = dom.engineBadge();
  const privacy = dom.privacyBadge();
  badge.textContent = label;
  badge.className = "badge";
  privacy.className = "badge";

  if (mode === "on_device") {
    badge.classList.add("badge-local");
    privacy.classList.add("badge-local");
    privacy.textContent = privacyOverride ?? "数据未离开本机 · 断网可用";
  } else if (mode === "in_cloud") {
    badge.classList.add("badge-cloud");
    privacy.classList.add("badge-cloud");
    privacy.textContent = privacyOverride ?? "云端 Gemini 推理（Firebase AI Logic）";
  } else if (mode === "error") {
    badge.classList.add("badge-warn");
    privacy.classList.add("badge-warn");
    privacy.textContent = privacyOverride ?? "推理受阻";
  } else {
    privacy.textContent = privacyOverride ?? "待命";
  }
}

const STATE_HINTS: Record<AppState, string> = {
  INIT: "正在检测端侧模型...",
  READY_LOCAL: "端侧 Nano 就绪，断网亦可用",
  READY_CLOUD_ONLY: "本地脱敏可用，提炼将尝试云端回退",
  RUNNING_LOCAL: "本机脱敏 + Gemini Nano 推理中",
  RUNNING_CLOUD: "仅发送脱敏文本至云端分析中",
  FALLBACK_CLOUD: "本地已脱敏，尝试云端回退提炼",
  ERROR: "当前操作受阻，本地脱敏仍可继续",
};

export function renderState(state: AppState): void {
  dom.stateLabel().textContent = state;
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
    s2.classList.add("is-active");
  } else if (stage === "cloud" || stage === "cloud_done") {
    s1.classList.add("is-done");
    s2.classList.add("is-done");
    s3.classList.add("is-active");
  } else if (stage === "cloud_degraded") {
    s1.classList.add("is-done");
    s3.classList.add("is-warn");
  }
}

export function renderMemoryCount(count: number): void {
  const el = dom.memoryBadge();
  if (!el) return;
  el.textContent =
    count >= 2
      ? `内存已缓存脱敏文档：${count} 份（可跨文档对比）`
      : `内存已缓存脱敏文档：${count} 份`;
  el.className = count > 0 ? "pill pill-local" : "pill";
}

export function renderOutputMode(
  label: string,
  tone: "idle" | "local" | "cloud" | "warn"
): void {
  const el = dom.outputModePill();
  if (!el) return;
  el.textContent = label;
  el.className = tone === "idle" ? "pill" : `pill pill-${tone}`;
}

export function renderRedactSummary(mapping: Record<string, string> | null): void {
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
  lead.textContent = `本地已替换 ${tokens.length} 项（映射仅存内存）：`;
  box.appendChild(lead);
  for (const [label, n] of counts) {
    const chip = document.createElement("span");
    chip.className = "redact-chip";
    chip.textContent = `${label} ×${n}`;
    box.appendChild(chip);
  }
  box.hidden = false;
}

export function renderLatency(source: "on_device" | "in_cloud", ms: number): void {
  const target = source === "on_device" ? dom.latencyLocal() : dom.latencyCloud();
  target.textContent = `${ms} ms`;
}

export function renderOutput(text: string): void {
  dom.outputBox().textContent = text;
}

export function setBusy(busy: boolean): void {
  dom.btnLocal().disabled = busy;
  dom.btnCloud().disabled = busy;
  dom.btnPing().disabled = busy;
  dom.btnSampleMedical().disabled = busy;
  dom.btnSampleReceipt().disabled = busy;
  const qm = dom.btnQuickMedical();
  const qr = dom.btnQuickReceipt();
  if (qm) qm.disabled = busy;
  if (qr) qr.disabled = busy;
}
