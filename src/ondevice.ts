export type NanoAvailability =
  | "available"
  | "downloadable"
  | "downloading"
  | "unavailable"
  | "unsupported";

interface LanguageModelSession {
  prompt(input: string): Promise<string>;
  clone?: () => Promise<LanguageModelSession>;
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

const ZH_LANG: LanguageModelCreateOptions = {
  expectedInputs: [{ type: "text", languages: ["zh"] }],
  expectedOutputs: [{ type: "text", languages: ["zh"] }],
  expectedInputLanguages: ["zh"],
  outputLanguage: "zh",
};

const EN_LANG: LanguageModelCreateOptions = {
  expectedInputs: [{ type: "text", languages: ["en"] }],
  expectedOutputs: [{ type: "text", languages: ["en"] }],
  expectedInputLanguages: ["en"],
  outputLanguage: "en",
};

let activeLangOptions: LanguageModelCreateOptions = EN_LANG;
let activeLangCode: "zh" | "en" = "en";
let baseSession: LanguageModelSession | null = null;

export function getActiveNanoLanguage(): "zh" | "en" {
  return activeLangCode;
}

export async function checkOnDeviceAvailability(): Promise<NanoAvailability> {
  if (typeof window === "undefined" || !window.LanguageModel) {
    return "unsupported";
  }
  // Probe zh support first; gracefully fall back to verified en declaration if unsupported.
  try {
    const zhStatus = await window.LanguageModel.availability(ZH_LANG);
    if (zhStatus === "available" || zhStatus === "downloadable" || zhStatus === "downloading") {
      activeLangOptions = ZH_LANG;
      activeLangCode = "zh";
      return zhStatus;
    }
  } catch {
    // Ignore and fall back to en probe
  }
  try {
    activeLangOptions = EN_LANG;
    activeLangCode = "en";
    return await window.LanguageModel.availability(EN_LANG);
  } catch {
    return "unavailable";
  }
}

export async function promptOnDevice(
  prompt: string,
  onProgress?: (pct: number) => void
): Promise<{ text: string; latencyMs: number; language: "zh" | "en" }> {
  if (!window.LanguageModel) {
    throw new Error("当前浏览器不支持 Prompt API (LanguageModel)");
  }
  const t0 = performance.now();
  const createOpts: LanguageModelCreateOptions = {
    ...activeLangOptions,
    monitor(m) {
      m.addEventListener("downloadprogress", (e: Event) => {
        const ev = e as ProgressEvent;
        if (!onProgress) return;
        const pct = ev.total > 0 ? (ev.loaded / ev.total) * 100 : ev.loaded * 100;
        onProgress(Math.min(100, Math.round(pct)));
      });
    },
  };

  let runSession: LanguageModelSession;
  let shouldDestroyRunSession = false;

  if (!baseSession) {
    baseSession = await window.LanguageModel.create(createOpts);
  }

  if (typeof baseSession.clone === "function") {
    try {
      runSession = await baseSession.clone();
      shouldDestroyRunSession = true;
    } catch {
      baseSession.destroy();
      baseSession = await window.LanguageModel.create(createOpts);
      runSession = baseSession;
    }
  } else {
    // Fresh session per document prevents cross-document context bleed when clone() is absent.
    baseSession.destroy();
    baseSession = await window.LanguageModel.create(createOpts);
    runSession = baseSession;
  }

  try {
    const text = await runSession.prompt(prompt);
    return {
      text,
      latencyMs: Math.round(performance.now() - t0),
      language: activeLangCode,
    };
  } finally {
    if (shouldDestroyRunSession) {
      runSession.destroy();
    }
  }
}

export function resetOnDeviceSession(): void {
  baseSession?.destroy();
  baseSession = null;
}
