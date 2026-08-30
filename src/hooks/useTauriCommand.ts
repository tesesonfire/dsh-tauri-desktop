import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "@/stores/toastStore";

export interface UseTauriCommandResult<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  /** 执行命令（自动 loading/错误 Toast） */
  run: (...args: unknown[]) => Promise<T | null>;
  setData: (data: T | null) => void;
}

/**
 * Tauri 命令调用 Hook：统一 loading 与错误处理（错误自动 Toast）。
 * 泛型封装，页面层不重复写 try/catch。
 */
export function useTauriCommand<T>(
  fn: (...args: never[]) => Promise<T>,
  options: { silent?: boolean } = {},
): UseTauriCommandResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  const run = useCallback(
    async (...args: unknown[]): Promise<T | null> => {
      setLoading(true);
      setError(null);
      try {
        const result = await (fnRef.current as (...a: unknown[]) => Promise<T>)(...args);
        setData(result);
        return result;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setError(message);
        if (!options.silent) toast.error(message);
        return null;
      } finally {
        setLoading(false);
      }
    },
    [options.silent],
  );

  return { data, loading, error, run, setData };
}

/**
 * 组件挂载时执行一次异步加载。
 */
export function useOnMount(callback: () => void | Promise<void>): void {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;
  useEffect(() => {
    void callbackRef.current();
  }, []);
}
