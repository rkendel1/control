import { invoke as tauriInvoke } from "@tauri-apps/api/core";

export type CommandResponse<T = unknown> = {
  success: boolean;
  data?: T;
  error?: string;
};

export function isTauriRuntime(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  const w = window as unknown as {
    __TAURI_IPC__?: unknown;
    __TAURI_INTERNALS__?: unknown;
    __TAURI__?: unknown;
  };

  return (
    typeof w.__TAURI_IPC__ === "function" ||
    typeof w.__TAURI_INTERNALS__ !== "undefined" ||
    typeof w.__TAURI__ !== "undefined"
  );
}

export async function invoke<T = unknown>(
  command: string,
  args?: Record<string, unknown>
): Promise<CommandResponse<T>> {
  try {
    return await tauriInvoke<CommandResponse<T>>(command, args);
  } catch (error) {
    if (!isTauriRuntime()) {
      return {
        success: false,
        error:
          "Tauri runtime is not available. Start this UI via Tauri desktop mode.",
      };
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
