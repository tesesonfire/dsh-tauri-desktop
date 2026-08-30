import { useEffect, useState } from "react";
import { HashRouter, Navigate, Route, Routes, useNavigate } from "react-router-dom";
import TitleBar from "@/components/TitleBar";
import { Toaster } from "@/components/ui/Toaster";
import MainPage from "@/pages/MainPage";
import SettingsPage from "@/pages/SettingsPage";
import PluginMarketPage from "@/pages/PluginMarketPage";
import ProfileManagerPage from "@/pages/ProfileManagerPage";
import OnboardingPage from "@/pages/OnboardingPage";
import { pluginBridge } from "@/plugins/PluginBridge";
import { useTheme } from "@/hooks/useTheme";
import { useWindowStore, detectPlatform } from "@/stores/windowStore";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { appReady, settingsGet } from "@/services/tauriService";
import { isTauriEnvironment } from "@/services/dshService";
import type { AppSettings } from "@/types/tauri";

/**
 * 根组件：主题初始化 + 启动画面切换 + 路由。
 * 使用 HashRouter：Tauri WebView 的自定义协议下路径路由不可靠，hash 最稳定。
 */
export default function App(): React.ReactElement {
  const [onboarded, setOnboarded] = useState<boolean | null>(null);
  const setPlatform = useWindowStore((s) => s.setPlatform);
  const { init: initTheme } = useTheme();

  useEffect(() => {
    initTheme();
    setPlatform(detectPlatform());
    pluginBridge.start();

    // 根据设置决定是否进入引导
    if (isTauriEnvironment()) {
      void settingsGet()
        .then((settings: AppSettings) => setOnboarded(settings.onboarded))
        .catch(() => setOnboarded(true));
      // 前端就绪：关闭闪屏、显示主窗口
      void appReady().catch((err: unknown) => console.error("app_ready failed:", err));
      // 窗口行为：启动时最大化/最小化（失败静默 —— 首个 settingsGet 已兜底路由）
      void settingsGet()
        .then((settings: AppSettings) => {
          const win = getCurrentWindow();
          if (settings.general.launchBehavior === "maximized") {
            void win.maximize().catch(() => undefined);
          } else if (settings.general.launchBehavior === "minimized") {
            void win.minimize().catch(() => undefined);
          }
        })
        .catch(() => undefined);
    } else {
      setOnboarded(true); // 纯浏览器 dev 环境跳过
    }

    return () => pluginBridge.stop();
  }, [initTheme, setPlatform]);

  if (onboarded === null) {
    return <div className="h-full bg-background" />;
  }

  return (
    <div className="flex h-full flex-col">
      <TitleBar />
      <div className="min-h-0 flex-1">
        <HashRouter>
          <Routes>
            <Route
              path="/"
              element={
                onboarded ? (
                  <MainPage />
                ) : (
                  <OnboardingGate onDone={() => setOnboarded(true)} />
                )
              }
            />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/market" element={<PluginMarketPage />} />
            <Route path="/profiles" element={<ProfileManagerPage />} />
            <Route path="/onboarding" element={<OnboardingGate onDone={() => setOnboarded(true)} />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </HashRouter>
      </div>
      <Toaster />
    </div>
  );
}

/** 引导页包装：完成后跳回主页 */
function OnboardingGate(props: { onDone: () => void }): React.ReactElement {
  const navigate = useNavigate();
  return (
    <OnboardingPage
      onDone={() => {
        props.onDone();
        void navigate("/", { replace: true });
      }}
    />
  );
}
