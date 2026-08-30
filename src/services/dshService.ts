import type { StartOptions } from "@/types/dsh";

/** StartOptions 转发导出（供 hooks 使用） */
export type { StartOptions };

/**
 * dsh WebUI 心跳检测。
 *
 * iframe 跨域无法读取内容，使用 no-cors fetch 探活：
 * 网络层成功（即使响应 opaque）即视为可达。
 */
export async function pingDsh(host = "127.0.0.1", port = 3080, timeoutMs = 3000): Promise<boolean> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    await fetch(`http://${host}:${port}/`, {
      mode: "no-cors",
      cache: "no-store",
      signal: controller.signal,
    });
    return true;
  } catch {
    return false;
  } finally {
    window.clearTimeout(timer);
  }
}

/** dsh WebUI 地址（iframe src）。 */
export function dshWebUrl(host: string, port: number): string {
  return `http://${host}:${port}/`;
}

/** 连接失败重试的指数退避延迟序列（ms）：1s, 2s, 4s, 8s, 上限 15s。 */
export function retryDelayMs(attempt: number): number {
  return Math.min(1000 * 2 ** attempt, 15000);
}

/**
 * 在浏览器环境（纯 vite dev）下降级：直接认为可用，避免开发时假报错。
 */
export function isTauriEnvironment(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}
