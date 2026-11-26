export type EngineMode = "idle" | "on_device" | "in_cloud" | "error";

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
};

export function renderEngineStatus(mode: EngineMode, label: string): void {
  const badge = dom.engineBadge();
  const privacy = dom.privacyBadge();
  badge.textContent = label;
  badge.className = "badge";
  privacy.className = "badge";

  if (mode === "on_device") {
    badge.classList.add("badge-local");
    privacy.classList.add("badge-local");
    privacy.textContent = "数据未离开本机 · 断网可用";
  } else if (mode === "in_cloud") {
    badge.classList.add("badge-cloud");
    privacy.classList.add("badge-cloud");
    privacy.textContent = "云端 Gemini 推理（Firebase AI Logic）";
  } else if (mode === "error") {
    badge.classList.add("badge-warn");
    privacy.classList.add("badge-warn");
    privacy.textContent = "推理受阻";
  } else {
    privacy.textContent = "待命";
  }
}

export function renderState(state: AppState): void {
  dom.stateLabel().textContent = state;
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
}
