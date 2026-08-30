// 构建全部内置插件：plugins/<id>/src/index.ts -> dist/index.js (IIFE bundle)
import { build } from "esbuild";
import { readdirSync, statSync } from "node:fs";
import path from "node:path";

const pluginsRoot = path.resolve("plugins");

const pluginDirs = readdirSync(pluginsRoot).filter((name) => {
  const dir = path.join(pluginsRoot, name);
  return (
    statSync(dir).isDirectory() &&
    name !== "sdk" &&
    statSync(path.join(dir, "manifest.json")).isFile()
  );
});

for (const name of pluginDirs) {
  const entry = path.join(pluginsRoot, name, "src", "index.ts");
  const outfile = path.join(pluginsRoot, name, "dist", "index.js");
  await build({
    entryPoints: [entry],
    outfile,
    bundle: true,
    format: "iife",
    target: "chrome105",
    minify: process.env.NODE_ENV === "production",
    logLevel: "info",
  });
  console.log(`built ${name} -> dist/index.js`);
}

console.log(`\n${pluginDirs.length} 个插件构建完成`);
