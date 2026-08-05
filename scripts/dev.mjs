import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";

const root = path.resolve(import.meta.dirname, "..");
const executable = (name) => path.join(root, "node_modules", ".bin", name);
const children = [
  spawn(executable("tsx"), ["watch", "src/server/index.ts"], {
    cwd: root,
    env: { ...process.env, NODE_ENV: "development" },
    stdio: "inherit",
  }),
  spawn(executable("vite"), ["--host", "127.0.0.1", "--port", "3000"], {
    cwd: root,
    env: { ...process.env, NODE_ENV: "development" },
    stdio: "inherit",
  }),
];

let stopping = false;

function stop(signal = "SIGTERM") {
  if (stopping) return;
  stopping = true;
  children.forEach((child) => {
    if (!child.killed) child.kill(signal);
  });
}

children.forEach((child) => {
  child.on("error", (error) => {
    console.error(error);
    stop();
    process.exitCode = 1;
  });
  child.on("exit", (code, signal) => {
    if (stopping) return;
    console.error(`Development process exited (${signal ?? code ?? "unknown"}).`);
    stop();
    process.exitCode = code ?? 1;
  });
});

process.once("SIGINT", () => stop("SIGINT"));
process.once("SIGTERM", () => stop("SIGTERM"));
