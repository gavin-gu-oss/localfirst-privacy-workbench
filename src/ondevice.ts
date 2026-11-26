export type NanoAvailability =
  | "available"
  | "downloadable"
  | "downloading"
  | "unavailable"
  | "unsupported";

interface LanguageModelSession {
  prompt(input: string): Promise<string>;
  destroy(): void;
}

interface LanguageModelCreateOptions {
  expectedInputs?: Array<{ type: "text"; languages?: string[] }>;
  expectedOutputs?: Array<{ type: "text"; languages?: string[] }>;
  expectedInputLanguages?: string[];
  outputLanguage?: string;
  systemPrompt?: string;
  monitor?: (m: EventTarget) => void;
}

interface LanguageModelAPI {
  availability(options?: LanguageModelCreateOptions): Promise<NanoAvailability>;
  create(options?: LanguageModelCreateOptions): Promise<LanguageModelSession>;
}

declare global {
  interface Window {
    LanguageModel?: LanguageModelAPI;
  }
}

const DEFAULT_LANG: LanguageModelCreateOptions = {
  expectedInputs: [{ type: "text", languages: ["en"] }],
  expectedOutputs: [{ type: "text", languages: ["en"] }],
  expectedInputLanguages: ["en"],
  outputLanguage: "en",
};

let cachedSession: LanguageModelSession | null = null;

export async function checkOnDeviceAvailability(): Promise<NanoAvailability> {
  if (typeof window === "undefined" || !window.LanguageModel) {
    return "unsupported";
  }
  try {
    return await window.LanguageModel.availability(DEFAULT_LANG);
  } catch {
    return "unavailable";
  }
}

export async function promptOnDevice(
  prompt: string,
  onProgress?: (pct: number) => void
): Promise<{ text: string; latencyMs: number }> {
  if (!window.LanguageModel) {
    throw new Error("当前浏览器不支持 Prompt API (LanguageModel)");
  }
  const t0 = performance.now();
  if (!cachedSession) {
    cachedSession = await window.LanguageModel.create({
      ...DEFAULT_LANG,
      monitor(m) {
        m.addEventListener("downloadprogress", (e: Event) => {
          const ev = e as ProgressEvent;
          if (!onProgress) return;
          const pct = ev.total > 0 ? (ev.loaded / ev.total) * 100 : ev.loaded * 100;
          onProgress(Math.min(100, Math.round(pct)));
        });
      },
    });
  }
  const text = await cachedSession.prompt(prompt);
  return { text, latencyMs: Math.round(performance.now() - t0) };
}

export function resetOnDeviceSession(): void {
  cachedSession?.destroy();
  cachedSession = null;
}
