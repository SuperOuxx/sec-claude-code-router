import fs from "node:fs/promises";
import readline from "node:readline";
import JSON5 from "json5";
import path from "node:path";
import { createHash } from "node:crypto";
import os from "node:os";
import net from "node:net";
import {
  CONFIG_FILE,
  HOME_DIR, PID_FILE,
  LEGACY_HOME_DIR,
  PLUGINS_DIR,
  PRESETS_DIR,
  REFERENCE_COUNT_FILE,
  readPresetFile,
} from "@CCR/shared";
import { getServer } from "@CCR/server";
import { writeFileSync, existsSync, readFileSync, mkdirSync } from "fs";
import { checkForUpdates, performUpdate } from "./update";
import { version } from "../../package.json";
import { spawn } from "child_process";
import {cleanupPidFile, isServiceRunning} from "./processCheck";

// Function to interpolate environment variables in config values
const interpolateEnvVars = (obj: any): any => {
  if (typeof obj === "string") {
    // Replace $VAR_NAME or ${VAR_NAME} with environment variable values
    return obj.replace(/\$\{([^}]+)\}|\$([A-Z_][A-Z0-9_]*)/g, (match, braced, unbraced) => {
      const varName = braced || unbraced;
      return process.env[varName] || match; // Keep original if env var doesn't exist
    });
  } else if (Array.isArray(obj)) {
    return obj.map(interpolateEnvVars);
  } else if (obj !== null && typeof obj === "object") {
    const result: any = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = interpolateEnvVars(value);
    }
    return result;
  }
  return obj;
};

const ensureDir = async (dir_path: string) => {
  try {
    await fs.access(dir_path);
  } catch {
    await fs.mkdir(dir_path, { recursive: true });
  }
};

const isPortAvailable = (port: number, host = "0.0.0.0") =>
  new Promise<boolean>((resolve) => {
    const server = net.createServer();

    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close(() => resolve(true));
    });

    server.listen(port, host);
    server.unref();
  });

const findAvailablePort = async (startPort: number) => {
  for (let port = startPort; port < startPort + 100; port++) {
    // eslint-disable-next-line no-await-in-loop
    if (await isPortAvailable(port)) return port;
  }
  throw new Error(`No available port found starting from ${startPort}`);
};

export const initDir = async () => {
  await ensureDir(HOME_DIR);
  await ensureDir(PLUGINS_DIR);
  await ensureDir(PRESETS_DIR);
  await ensureDir(path.join(HOME_DIR, "logs"));
};

const createReadline = () => {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
};

const question = (query: string): Promise<string> => {
  return new Promise((resolve) => {
    const rl = createReadline();
    rl.question(query, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
};

const confirm = async (query: string): Promise<boolean> => {
  const answer = await question(query);
  return answer.toLowerCase() !== "n";
};

export const readConfigFile = async () => {
  try {
    const config = await fs.readFile(CONFIG_FILE, "utf-8");
    try {
      // Try to parse with JSON5 first (which also supports standard JSON)
      const parsedConfig = JSON5.parse(config);
      // Interpolate environment variables in the parsed config
      return interpolateEnvVars(parsedConfig);
    } catch (parseError) {
      console.error(`Failed to parse config file at ${CONFIG_FILE}`);
      console.error("Error details:", (parseError as Error).message);
      console.error("Please check your config file syntax.");
      process.exit(1);
    }
  } catch (readError: any) {
    if (readError.code === "ENOENT") {
      try {
        // If this is a fresh sec-ccr install, migrate legacy ccr config once.
        const legacyConfigPath = path.join(LEGACY_HOME_DIR, "config.json");
        const hasLegacyConfig = await fs
          .access(legacyConfigPath)
          .then(() => true)
          .catch(() => false);

        if (hasLegacyConfig) {
          await initDir();
          await fs.copyFile(legacyConfigPath, CONFIG_FILE);
          console.log(`Migrated legacy config: ${legacyConfigPath} -> ${CONFIG_FILE}`);
          const migrated = await fs.readFile(CONFIG_FILE, "utf-8");
          return interpolateEnvVars(JSON5.parse(migrated));
        }

        // Initialize directories
        await initDir();

        // Backup existing config file if it exists
        const backupPath = await backupConfigFile();
        if (backupPath) {
          console.log(
              `Backed up existing configuration file to ${backupPath}`
          );
        }
        const config = {
          PORT: 3457,
          Providers: [],
          Router: {},
        }
        // Create a minimal default config file
        await writeConfigFile(config);
        console.log(
            `Created minimal default configuration file at ${CONFIG_FILE}`
        );
        console.log(
            "Please edit this file with your actual configuration."
        );
        return config
      } catch (error: any) {
        console.error(
            "Failed to create default configuration:",
            error.message
        );
        process.exit(1);
      }
    } else {
      console.error(`Failed to read config file at ${CONFIG_FILE}`);
      console.error("Error details:", readError.message);
      process.exit(1);
    }
  }
};

export const backupConfigFile = async () => {
  try {
    if (await fs.access(CONFIG_FILE).then(() => true).catch(() => false)) {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupPath = `${CONFIG_FILE}.${timestamp}.bak`;
      await fs.copyFile(CONFIG_FILE, backupPath);

      // Clean up old backups, keeping only the 3 most recent
      try {
        const configDir = path.dirname(CONFIG_FILE);
        const configFileName = path.basename(CONFIG_FILE);
        const files = await fs.readdir(configDir);

        // Find all backup files for this config
        const backupFiles = files
          .filter(file => file.startsWith(configFileName) && file.endsWith('.bak'))
          .sort()
          .reverse(); // Sort in descending order (newest first)

        // Delete all but the 3 most recent backups
        if (backupFiles.length > 3) {
          for (let i = 3; i < backupFiles.length; i++) {
            const oldBackupPath = path.join(configDir, backupFiles[i]);
            await fs.unlink(oldBackupPath);
          }
        }
      } catch (cleanupError) {
        console.warn("Failed to clean up old backups:", cleanupError);
      }

      return backupPath;
    }
  } catch (error) {
    console.error("Failed to backup config file:", error);
  }
  return null;
};

export const writeConfigFile = async (config: any) => {
  await ensureDir(HOME_DIR);
  const configWithComment = `${JSON.stringify(config, null, 2)}`;
  await fs.writeFile(CONFIG_FILE, configWithComment);
};

export const initConfig = async () => {
  const config = await readConfigFile();
  Object.assign(process.env, config);
  return config;
};

export const run = async (args: string[] = []) => {
  const isRunning = isServiceRunning()
  if (isRunning) {
    console.log('claude-code-router server is running');
    return;
  }

  let attempt = 0;
  while (attempt < 3) {
    const server = await getServer();
    const app = server.app;

    // Save the PID of the background process
    writeFileSync(PID_FILE, process.pid.toString());

    app.post('/api/update/perform', async () => {
      return await performUpdate();
    })

    app.get('/api/update/check', async () => {
      return await checkForUpdates(version);
    })

    app.post("/api/restart", async () => {
      setTimeout(async () => {
        const cliPath = path.join(__dirname, "cli.js");
        spawn(process.execPath, [cliPath, "restart"], {
          detached: true,
          stdio: "ignore",
        }).unref();
      }, 100);

      return { success: true, message: "Service restart initiated" }
    });

    try {
      // await server.start() to ensure it starts successfully and keep process alive
      await server.start();
      return;
    } catch (error: any) {
      cleanupPidFile();

      if (error?.code !== "EADDRINUSE") throw error;

      const config = await readConfigFile();
      const currentPort = Number(config.PORT) || 3457;
      const nextPort = await findAvailablePort(currentPort + 1);
      const backupPath = await backupConfigFile();

      await writeConfigFile({
        ...config,
        PORT: nextPort,
      });

      console.error(
        `Port ${currentPort} is already in use. Updated ${CONFIG_FILE} PORT to ${nextPort}` +
        (backupPath ? ` (backup: ${backupPath})` : "") +
        ". Retrying..."
      );

      attempt++;
    }
  }

  throw new Error("Failed to start service after retrying with a new port.");
}

export const restartService = async () => {
  // Stop the service if it's running
  try {
    const pid = parseInt(readFileSync(PID_FILE, "utf-8"));
    process.kill(pid);
    cleanupPidFile();
    if (existsSync(REFERENCE_COUNT_FILE)) {
      try {
        await fs.unlink(REFERENCE_COUNT_FILE);
      } catch (e) {
        // Ignore cleanup errors
      }
    }
    console.log("claude code router service has been stopped.");
  } catch (e) {
    console.log("Service was not running or failed to stop.");
    cleanupPidFile();
  }

  // Start the service again in the background
  console.log("Starting claude code router service...");
  const cliPath = path.join(__dirname, "cli.js");
  const startProcess = spawn("node", [cliPath, "start"], {
    detached: true,
    stdio: "ignore",
  });

  startProcess.on("error", (error) => {
    console.error("Failed to start service:", error);
    throw error;
  });

  startProcess.unref();

  const startTime = Date.now();
  while (Date.now() - startTime < 30000) {
    if (isServiceRunning()) {
      console.log("Service started successfully in the background.");
      return;
    }
    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  throw new Error(
    "Service startup timeout. Try running `sec-ccr start` to see the error output."
  );
};


/**
 * Get a temporary path for the settings file
 * Hash the content and return the file path if it already exists in temp directory,
 * otherwise create a new file with the content
 * @param content Settings content string
 * @returns Full path to the temporary file
 */
export const getSettingsPath = async (content: string): Promise<string> => {
  // Hash the content using SHA256 algorithm
  const hash = createHash('sha256').update(content, 'utf-8').digest('hex');

  // Create claude-code-router directory in system temp folder
  const tempDir = path.join(os.tmpdir(), 'sec-claude-code-router');
  const fileName = `sec-ccr-settings-${hash}.json`;
  const tempFilePath = path.join(tempDir, fileName);

  // Ensure the directory exists
  try {
    await fs.access(tempDir);
  } catch {
    await fs.mkdir(tempDir, { recursive: true });
  }

  // Check if the file already exists
  try {
    await fs.access(tempFilePath);
    return tempFilePath;
  } catch {
    // File doesn't exist, create and write content
    await fs.writeFile(tempFilePath, content, 'utf-8');
    return tempFilePath;
  }
}
