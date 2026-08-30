import { BridgeClient } from "../../sdk/bridge-client";

/** 一次桥接调用的记录 */
export interface InvocationRecord {
  method: string;
  at: number;
  ok: boolean;
  durationMs: number;
}

export interface BridgeHealth {
  hostReachable: boolean;
  version: string | null;
  lastError: string | null;
}

/** 通信桥状态聚合器（纯逻辑，可测试） */
export class BridgeStatusModel {
  private records: InvocationRecord[] = [];

  record(record: InvocationRecord): void {
    this.records.push(record);
    if (this.records.length > 100) {
      this.records.shift();
    }
  }

  /** 最近 N 次调用记录 */
  recent(count: number): InvocationRecord[] {
    return this.records.slice(-count).reverse();
  }

  /** 成功率（无记录返回 null） */
  successRate(): number | null {
    if (this.records.length === 0) return null;
    const ok = this.records.filter((r) => r.ok).length;
    return ok / this.records.length;
  }

  /** 平均耗时 ms（无记录返回 null） */
  averageDuration(): number | null {
    if (this.records.length === 0) return null;
    const total = this.records.reduce((sum, r) => sum + r.durationMs, 0);
    return total / this.records.length;
  }

  clear(): void {
    this.records = [];
  }
}

/** 带记录功能的调用包装 */
export async function invokeWithTracking(
  client: BridgeClient,
  method: Parameters<BridgeClient["call"]>[0],
  payload?: unknown,
  model?: BridgeStatusModel,
): Promise<unknown> {
  const started = Date.now();
  try {
    const result = await client.call(method, payload);
    model?.record({ method, at: started, ok: true, durationMs: Date.now() - started });
    return result;
  } catch (err) {
    model?.record({ method, at: started, ok: false, durationMs: Date.now() - started });
    throw err;
  }
}

/** 探活：ping 宿主并提取版本 */
export async function pingHost(client: BridgeClient): Promise<BridgeHealth> {
  try {
    const result = (await client.call<{ ok: boolean; version: string }>("ping")) as {
      ok: boolean;
      version: string;
    };
    return { hostReachable: result.ok, version: result.version, lastError: null };
  } catch (err) {
    return {
      hostReachable: false,
      version: null,
      lastError: err instanceof Error ? err.message : String(err),
    };
  }
}
