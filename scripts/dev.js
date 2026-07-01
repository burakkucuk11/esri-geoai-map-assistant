import { spawn } from "node:child_process";

const isWindows = process.platform === "win32";

const backendProcess = {
  name: "backend",
  command: process.execPath,
  args: ["server/index.js"]
};

const frontendProcess = {
  name: "frontend",
  command: isWindows ? "cmd.exe" : "npm",
  args: isWindows ? ["/d", "/s", "/c", "npm.cmd run dev:frontend"] : ["run", "dev:frontend"]
};

async function getBackendStatus() {
  try {
    const response = await fetch("http://localhost:3001/api/health", {
      signal: AbortSignal.timeout(1000)
    });

    if (!response.ok) {
      return "down";
    }

    const health = await response.json().catch(() => null);
    if (health?.capabilities?.queryPlan) {
      return "current";
    }

    return health?.service === "geoai-esri-backend" ? "stale" : "down";
  } catch {
    return "down";
  }
}

const backendStatus = await getBackendStatus();

if (backendStatus === "stale") {
  console.error(
    "[backend] localhost:3001 uzerinde eski bir GeoAI backend calisiyor. Once eski node server/index.js process'ini kapatip npm run dev komutunu yeniden calistirin."
  );
  process.exit(1);
}

const processes = [
  ...(backendStatus === "current"
    ? (console.log("[backend] mevcut http://localhost:3001 backend kullanilacak."), [])
    : [backendProcess]),
  {
    ...frontendProcess
  }
];

const children = [];
let shuttingDown = false;

function prefixOutput(name, stream) {
  let buffer = "";

  stream.on("data", (chunk) => {
    buffer += chunk.toString();
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (line.trim()) {
        console.log(`[${name}] ${line}`);
      }
    }
  });
}

function stopAll(exitCode = 0) {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;

  for (const child of children) {
    if (!child.killed) {
      child.kill("SIGTERM");
    }
  }

  setTimeout(() => process.exit(exitCode), 250);
}

for (const processConfig of processes) {
  const child = spawn(processConfig.command, processConfig.args, {
    cwd: process.cwd(),
    env: process.env,
    shell: false,
    stdio: ["ignore", "pipe", "pipe"]
  });

  children.push(child);
  prefixOutput(processConfig.name, child.stdout);
  prefixOutput(processConfig.name, child.stderr);

  child.on("exit", (code, signal) => {
    if (!shuttingDown) {
      console.error(
        `[${processConfig.name}] kapandi (code=${code ?? "null"}, signal=${signal ?? "null"}).`
      );
      stopAll(code || 1);
    }
  });
}

process.on("SIGINT", () => stopAll(0));
process.on("SIGTERM", () => stopAll(0));

