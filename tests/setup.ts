// Vitest 全局 setup：jsdom + testing-library 匹配器 + matchMedia polyfill
import "@testing-library/jest-dom/vitest";

// jsdom 未实现 matchMedia（themeStore 等需要）
if (typeof window !== "undefined" && typeof window.matchMedia !== "function") {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string): MediaQueryList => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false,
    }) as MediaQueryList,
  });
}

// jsdom 未实现 scrollIntoView（DshLogs 自动滚动等需要）
if (typeof Element !== "undefined" && typeof Element.prototype.scrollIntoView !== "function") {
  Element.prototype.scrollIntoView = (): void => undefined;
}
