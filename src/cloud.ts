import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import {
  initializeAppCheck,
  ReCaptchaV3Provider,
  type AppCheck,
} from "firebase/app-check";
import {
  getAI,
  getGenerativeModel,
  GoogleAIBackend,
  InferenceMode,
  InferenceSource,
} from "firebase/ai";

export const FIREBASE_CONFIG = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "YOUR_API_KEY",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "YOUR_AUTH_DOMAIN",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "YOUR_PROJECT_ID",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "YOUR_APP_ID",
};

const CLOUD_MODEL =
  import.meta.env.VITE_FIREBASE_CLOUD_MODEL || "gemini-3.5-flash-lite";

export function isCloudConfigured(): boolean {
  return (
    !FIREBASE_CONFIG.apiKey.startsWith("YOUR_") &&
    !FIREBASE_CONFIG.projectId.startsWith("YOUR_")
  );
}

let cachedApp: FirebaseApp | null = null;
let cachedAppCheck: AppCheck | null = null;

/**
 * Firebase App Check integration point (non-blocking until configured).
 * - Production: set VITE_FIREBASE_APPCHECK_SITE_KEY (reCAPTCHA v3 site key).
 * - Local demo / hackathon judging: set VITE_FIREBASE_APPCHECK_DEBUG_TOKEN
 *   (or "true" to print a fresh debug token in browser DevTools console and
 *   register it in Firebase Console -> App Check -> Apps -> Manage debug tokens).
 */
function ensureAppCheck(app: FirebaseApp): AppCheck | null {
  if (cachedAppCheck) return cachedAppCheck;
  const siteKey = import.meta.env.VITE_FIREBASE_APPCHECK_SITE_KEY as string | undefined;
  if (!siteKey) return null;

  const debugToken = import.meta.env.VITE_FIREBASE_APPCHECK_DEBUG_TOKEN as string | undefined;
  if (debugToken) {
    const g = globalThis as typeof globalThis & {
      FIREBASE_APPCHECK_DEBUG_TOKEN?: string | boolean;
    };
    g.FIREBASE_APPCHECK_DEBUG_TOKEN = debugToken === "true" ? true : debugToken;
  }

  cachedAppCheck = initializeAppCheck(app, {
    provider: new ReCaptchaV3Provider(siteKey),
    isTokenAutoRefreshEnabled: true,
  });
  return cachedAppCheck;
}

function getFirebaseApp(): FirebaseApp {
  if (!isCloudConfigured()) {
    throw new Error("Firebase 云端尚未配置，请先在 .env.local 填入 6 项配置字段。");
  }
  if (!cachedApp) {
    cachedApp = getApps()[0] ?? initializeApp(FIREBASE_CONFIG);
  }
  ensureAppCheck(cachedApp);
  return cachedApp;
}

const CLOUD_TIMEOUT_MS = 20_000;

export async function runFirebaseAI(
  prompt: string,
  preferOnDevice = false
): Promise<{ text: string; latencyMs: number; source: "on_device" | "in_cloud" }> {
  const ai = getAI(getFirebaseApp(), { backend: new GoogleAIBackend() });
  const mode = preferOnDevice
    ? InferenceMode.PREFER_ON_DEVICE
    : InferenceMode.ONLY_IN_CLOUD;
  const model = getGenerativeModel(
    ai,
    {
      mode,
      onDeviceParams: {
        createOptions: {
          expectedInputs: [{ type: "text", languages: ["en"] }],
          expectedOutputs: [{ type: "text", languages: ["en"] }],
        },
      },
      inCloudParams: { model: CLOUD_MODEL },
    },
    { timeout: CLOUD_TIMEOUT_MS }
  );
  const controller = new AbortController();
  let timedOut = false;
  const timer = globalThis.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, CLOUD_TIMEOUT_MS);

  const t0 = performance.now();
  try {
    const result = await model.generateContent(prompt, {
      timeout: CLOUD_TIMEOUT_MS,
      signal: controller.signal,
    });
    const latencyMs = Math.round(performance.now() - t0);
    const source =
      result.response.inferenceSource === InferenceSource.ON_DEVICE
        ? "on_device"
        : "in_cloud";
    return { text: result.response.text(), latencyMs, source };
  } catch (err) {
    if (timedOut) {
      throw new Error(`云端请求超时（超过 ${CLOUD_TIMEOUT_MS / 1000} 秒），请检查网络或稍后重试。`);
    }
    throw err;
  } finally {
    globalThis.clearTimeout(timer);
  }
}

export async function runCrossDocCompare(
  redactedDocs: string[]
): Promise<string> {
  if (!isCloudConfigured()) {
    throw new Error("Firebase 云端尚未配置，请先在 .env.local 填入 6 项配置字段。");
  }
  const docs = redactedDocs.map((d) => d.trim()).filter(Boolean);
  if (docs.length === 0) {
    throw new Error("请至少提供一份已脱敏文本用于云端深度分析。");
  }
  const merged = docs
    .map((doc, idx) => `【文档 ${idx + 1}（已脱敏）】\n${doc}`)
    .join("\n\n");
  const isMulti = docs.length >= 2;
  const prompt = [
    "你是医疗与财务票据核对助手。以下均为已在本地脱敏的文档，严禁猜测隐私原值，请原样保留文档中的编号占位符（如 [姓名1]、[姓名2]、[手机号1] 等）以便用户在本地还原。",
    isMulti
      ? "请用简体中文按以下 3 个标题输出简洁、可核查的跨文档对比报告："
      : "请用简体中文按以下 3 个标题输出简洁、可核查的单文档深度核对报告：",
    "1. 费用汇总（逐项列出金额、自行验算明细之和与实付金额是否一致，并给出总计）",
    isMulti
      ? "2. 异常项核对（重点核查：主体是否一致如 [姓名1] 与 [姓名2]、是否跨城、是否重复开药/购药、日期先后是否合理、明细之和与实付总金额是否一致、是否混入非本次诊疗报销项；无异常请明确说明）"
      : "2. 异常项核对（重点核查：明细之和与实付金额是否一致、日期与项目合理性、是否存在非报销项混入；无异常请明确说明）",
    isMulti
      ? "3. 跨文档对比结论与核销建议（用 2-4 条要点总结关联关系与具体复核动作，引用原始占位符）"
      : "3. 核销建议（用 2-3 条要点总结报销注意点，引用原始占位符）",
    "",
    merged,
  ].join("\n");

  const res = await runFirebaseAI(prompt, false);
  return res.text;
}
