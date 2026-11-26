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

export async function runFirebaseAI(
  prompt: string,
  preferOnDevice = false
): Promise<{ text: string; latencyMs: number; source: "on_device" | "in_cloud" }> {
  const ai = getAI(getFirebaseApp(), { backend: new GoogleAIBackend() });
  const mode = preferOnDevice
    ? InferenceMode.PREFER_ON_DEVICE
    : InferenceMode.ONLY_IN_CLOUD;
  const model = getGenerativeModel(ai, {
    mode,
    onDeviceParams: {
      createOptions: {
        expectedInputs: [{ type: "text", languages: ["en"] }],
        expectedOutputs: [{ type: "text", languages: ["en"] }],
      },
    },
    inCloudParams: { model: CLOUD_MODEL },
  });
  const t0 = performance.now();
  const result = await model.generateContent(prompt);
  const latencyMs = Math.round(performance.now() - t0);
  const source =
    result.response.inferenceSource === InferenceSource.ON_DEVICE
      ? "on_device"
      : "in_cloud";
  return { text: result.response.text(), latencyMs, source };
}

export async function runCrossDocCompare(
  redactedDocs: string[]
): Promise<string> {
  if (!isCloudConfigured()) {
    throw new Error("Firebase 云端尚未配置，请先在 .env.local 填入 6 项配置字段。");
  }
  const docs = redactedDocs.map((d) => d.trim()).filter(Boolean);
  if (docs.length === 0) {
    throw new Error("请至少提供一份已脱敏文本用于云端跨文档对比。");
  }
  const merged = docs
    .map((doc, idx) => `【文档 ${idx + 1}（已脱敏）】\n${doc}`)
    .join("\n\n");
  const prompt = [
    "你是医疗与财务票据核对助手。以下均为已在本地脱敏的文档，请勿猜测隐私原值。",
    "请用简体中文按以下 3 个标题输出简洁报告：",
    "1. 费用汇总（逐项列出金额并计算总计）",
    "2. 异常项核对（如重复开药、日期冲突、金额不一致或可疑项；无异常请明确说明）",
    "3. 跨文档对比结论（用 2-4 条要点总结关联关系与核销建议）",
    "",
    merged,
  ].join("\n");

  const res = await runFirebaseAI(prompt, false);
  return res.text;
}
