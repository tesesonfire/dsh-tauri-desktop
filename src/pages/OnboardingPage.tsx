import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Switch } from "@/components/ui/Switch";
import { Badge } from "@/components/ui/Badge";
import { Card, CardContent } from "@/components/ui/Card";
import { Icon, type IconName } from "@/components/Icon";
import { presetsGet, profileCreate, settingsGet, settingsSave, dshEnvCheck, cliInstallShim } from "@/services/tauriService";
import { toast } from "@/stores/toastStore";
import { useOnMount } from "@/hooks/useTauriCommand";
import type { AppSettings } from "@/types/tauri";
import type { PresetPlugin } from "@/types/plugin";
import type { EnvCheckResult } from "@/types/dsh";

const STEPS = ["欢迎", "预设插件", "dsh 配置", "完成"] as const;

/**
 * 首次启动向导（Onboarding，4 步）：
 * 欢迎 → 预设插件勾选 → dsh 基础配置（DSH_HOME/档案/端口）→ 完成并进入主界面。
 */
export default function OnboardingPage(props: { onDone: () => void }): React.ReactElement {
  const [step, setStep] = useState<number>(0);
  const [presets, setPresets] = useState<PresetPlugin[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [env, setEnv] = useState<EnvCheckResult | null>(null);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [profileName, setProfileName] = useState<string>("default");
  const [port, setPort] = useState<string>("3080");
  const [finishing, setFinishing] = useState<boolean>(false);
  const [cliDone, setCliDone] = useState<boolean>(false);

  useOnMount(() => {
    void presetsGet()
      .then((file) => {
        setPresets(file.presets);
        setSelected(new Set(file.presets.filter((p) => p.recommended).map((p) => p.id)));
      })
      .catch((err: unknown) => toast.error(String(err)));
    void settingsGet().then(setSettings).catch(() => setSettings(null));
    void dshEnvCheck().then(setEnv).catch(() => setEnv(null));
  });

  useEffect(() => {
    if (settings !== null && settings.dsh.port !== 3080) {
      setPort(String(settings.dsh.port));
    }
  }, [settings]);

  const finish = async (): Promise<void> => {
    setFinishing(true);
    try {
      const base =
        settings ??
        ({
          onboarded: false,
          activeProfile: "",
          general: { theme: "system", language: "zh-CN", launchBehavior: "normal" },
          dsh: { nodePath: "", port: 3080, autoStart: true, defaultProfile: "" },
          advanced: {
            devMode: false,
            logLevel: "info",
            proxy: "",
            experimental: false,
            execAllowlist: ["git", "node", "npm", "pnpm", "npx"],
            fsAllowlist: [],
          },
        } satisfies AppSettings);
      const next: AppSettings = {
        ...base,
        onboarded: true,
        dsh: {
          ...base.dsh,
          port: Number(port) || 3080,
          defaultProfile: profileName.trim(),
        },
      };
      if (profileName.trim() !== "") {
        try {
          await profileCreate(profileName.trim(), Number(port) || 3080);
        } catch {
          // 档案已存在则忽略
        }
        next.activeProfile = profileName.trim();
      }
      await settingsSave(next);
      toast.success("配置完成，欢迎使用 dsh-tauri-desktop！");
      props.onDone();
    } catch (err) {
      toast.error(String(err));
    } finally {
      setFinishing(false);
    }
  };

  const selectedPresets = useMemo(
    () => presets.filter((p) => selected.has(p.id)),
    [presets, selected],
  );

  return (
    <div className="flex h-full items-center justify-center bg-background p-6">
      <div className="w-full max-w-xl">
        {/* 步骤指示 */}
        <ol className="mb-6 flex items-center justify-between">
          {STEPS.map((label, index) => (
            <li key={label} className="flex items-center gap-2">
              <span
                className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ${
                  index <= step ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                }`}
              >
                {index + 1}
              </span>
              <span className={`text-sm ${index === step ? "font-medium" : "text-muted-foreground"}`}>
                {label}
              </span>
            </li>
          ))}
        </ol>

        {step === 0 && (
          <Card>
            <CardContent className="flex flex-col items-center gap-4 py-10 text-center">
              <div className="flex h-16 w-16 animate-pulse items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-purple-500 text-2xl font-bold text-primary-foreground">
                dS
              </div>
              <h1 className="text-xl font-bold">欢迎使用 dsh-tauri-desktop</h1>
              <p className="max-w-md text-sm text-muted-foreground">
                这是 DeepSeek Harness (dsh) 的原生桌面壳：窗口管理、内嵌 WebUI、插件系统、
                进程生命周期与自更新。安装包小于 10MB，无需预装 Node.js 或 Docker。
              </p>
              {env !== null && (
                <div className="flex gap-2 text-xs">
                  <Badge variant={env.nodeOk ? "success" : "warn"}>
                    Node {env.nodeVersion ?? "未检测"}
                  </Badge>
                  <Badge variant={env.dshInstalled ? "success" : "warn"}>
                    dsh {env.dshInstalled ? "已安装" : "未安装（稍后可安装）"}
                  </Badge>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {step === 1 && (
          <Card>
            <CardContent className="flex flex-col gap-3 py-4">
              <h2 className="text-base font-semibold">选择预设插件</h2>
              <p className="text-xs text-muted-foreground">
                推荐配置可随时更改；列表支持远程更新（presets.json 资源）。
              </p>
              {presets.map((preset) => (
                <div
                  key={preset.id}
                  className="flex items-center justify-between rounded-md border p-3"
                >
                  <div className="flex items-start gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary">
                      <Icon name={preset.icon as IconName} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{preset.name}</span>
                        {preset.recommended && <Badge>推荐</Badge>}
                      </div>
                      <p className="text-xs text-muted-foreground">{preset.description}</p>
                    </div>
                  </div>
                  <Switch
                    checked={selected.has(preset.id)}
                    onChange={(checked) => {
                      const next = new Set(selected);
                      if (checked) next.add(preset.id);
                      else next.delete(preset.id);
                      setSelected(next);
                    }}
                  />
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {step === 2 && (
          <Card>
            <CardContent className="flex flex-col gap-4 py-4">
              <h2 className="text-base font-semibold">dsh 基础配置</h2>
              <label className="flex flex-col gap-1 text-sm">
                <span>默认档案名</span>
                <Input
                  value={profileName}
                  onChange={(e) => setProfileName(e.target.value)}
                  placeholder="default"
                />
                <span className="text-xs text-muted-foreground">
                  档案目录：~/.dsh/profiles/{profileName || "default"}（DSH_HOME 隔离）
                </span>
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span>dsh Web 端口</span>
                <Input type="number" value={port} onChange={(e) => setPort(e.target.value)} />
              </label>
              <p className="text-xs text-muted-foreground">
                DSH_HOME 默认位于 ~/.dsh，Node 运行时与 dsh 核心将在首次启动时按需安装。
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={cliDone}
                  onClick={() => {
                    void cliInstallShim()
                      .then(() => {
                        setCliDone(true);
                        toast.success("dsh 命令已注册，新开终端即可使用");
                      })
                      .catch((err: unknown) => toast.error(String(err)));
                  }}
                >
                  {cliDone ? "已注册 dsh 命令" : "注册 dsh 命令行工具（可选）"}
                </Button>
                <span className="text-xs text-muted-foreground">向 PATH 写入 dsh shim，可随时在设置中撤销</span>
              </div>
            </CardContent>
          </Card>
        )}

        {step === 3 && (
          <Card>
            <CardContent className="flex flex-col gap-3 py-8 text-center">
              <h2 className="text-lg font-semibold">一切就绪</h2>
              <div className="mx-auto flex max-w-sm flex-col gap-1 text-left text-sm text-muted-foreground">
                <p>默认档案：{profileName.trim() || "（无）"}</p>
                <p>dsh 端口：{port}</p>
                <p>已选预设插件：{selectedPresets.map((p) => p.name).join("、") || "（无）"}</p>
              </div>
              <p className="text-xs text-muted-foreground">
                预设插件将按选择启用；随后可进入主界面启动 dsh。
              </p>
            </CardContent>
          </Card>
        )}

        <div className="mt-4 flex justify-between">
          <Button variant="ghost" disabled={step === 0} onClick={() => setStep((s) => s - 1)}>
            上一步
          </Button>
          {step < STEPS.length - 1 ? (
            <Button onClick={() => setStep((s) => s + 1)}>下一步</Button>
          ) : (
            <Button onClick={() => void finish()} disabled={finishing}>
              {finishing ? "保存中…" : "进入应用"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
