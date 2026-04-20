#!/usr/bin/env node

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { spawn } from "node:child_process";

const stateDir = process.env.OPENCLAW_STATE_DIR?.trim() || "/tmp/.openclaw";
const workspaceDir = process.env.OPENCLAW_WORKSPACE_DIR?.trim() || "/tmp/workspace";
const configPath = process.env.OPENCLAW_CONFIG_PATH?.trim() || `${stateDir}/openclaw.json`;
const port = process.env.OPENCLAW_GATEWAY_PORT?.trim() || "8080";
const publicOrigin =
  process.env.OPENCLAW_PUBLIC_ORIGIN?.trim() || "https://agente-openclaw.onrender.com";

mkdirSync(stateDir, { recursive: true });
mkdirSync(workspaceDir, { recursive: true });
mkdirSync(dirname(configPath), { recursive: true });

const configuredModel = process.env.OPENAI_MODEL?.trim() || "google/gemini-2.5-flash";
const openAiCompatibleBaseUrl = process.env.OPENAI_BASE_URL?.trim();

const config = {
  gateway: {
    mode: "local",
    bind: "lan",
    port: Number.parseInt(port, 10) || 8080,
    controlUi: {
      allowedOrigins: [publicOrigin],
    },
  },
  agents: {
    defaults: {
      workspace: workspaceDir,
      model: {
        primary: configuredModel,
      },
    },
  },
};

if (openAiCompatibleBaseUrl) {
  const slashIndex = configuredModel.indexOf("/");
  const configuredProvider = slashIndex > 0 ? configuredModel.slice(0, slashIndex) : "openai";
  const configuredModelId = slashIndex > 0 ? configuredModel.slice(slashIndex + 1) : configuredModel;
  const providerId = configuredProvider === "google" ? "google-openai" : configuredProvider;

  config.agents.defaults.model.primary = `${providerId}/${configuredModelId}`;
  config.models = {
    mode: "merge",
    providers: {
      [providerId]: {
        baseUrl: openAiCompatibleBaseUrl,
        api: "openai-completions",
        apiKey: { source: "env", provider: "default", id: "OPENAI_API_KEY" },
        models: [
          {
            id: configuredModelId,
            name: configuredModelId,
            reasoning: false,
            input: ["text"],
          },
        ],
      },
    },
  };
}

writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, { encoding: "utf8" });

const child = spawn(
  process.execPath,
  ["openclaw.mjs", "gateway", "--allow-unconfigured", "--bind", "lan", "--port", port],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      OPENCLAW_CONFIG_PATH: configPath,
    },
  },
);

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    child.kill(signal);
  });
}

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
