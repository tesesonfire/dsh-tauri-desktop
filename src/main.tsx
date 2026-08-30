import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles/globals.css";
import { invoke } from "@tauri-apps/api/core";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

// 前端渲染就绪：通知 Rust 后端显示主窗口并关闭启动画面
invoke("app_ready").catch((err: unknown) => {
  console.error("app_ready failed:", err);
});
