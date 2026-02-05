import path from "node:path";
import os from "node:os";

/**
 * sec-claude-code-router uses an isolated home directory by default so it can
 * coexist with the upstream `claude-code-router` without sharing config/logs/pids.
 *
 * Override with:
 * - `SEC_CCR_HOME_DIR` (preferred for this fork)
 * - `CCR_HOME_DIR` (compat fallback)
 */
export const LEGACY_HOME_DIR = path.join(os.homedir(), ".claude-code-router");
export const DEFAULT_HOME_DIRNAME = ".sec-claude-code-router";
export const HOME_DIR =
  process.env.SEC_CCR_HOME_DIR ||
  process.env.CCR_HOME_DIR ||
  path.join(os.homedir(), DEFAULT_HOME_DIRNAME);

export const CONFIG_FILE = path.join(HOME_DIR, "config.json");

export const PLUGINS_DIR = path.join(HOME_DIR, "plugins");

export const PRESETS_DIR = path.join(HOME_DIR, "presets");

export const PID_FILE = path.join(HOME_DIR, ".sec-claude-code-router.pid");

export const REFERENCE_COUNT_FILE = path.join(
  os.tmpdir(),
  "sec-claude-code-reference-count.txt"
);

// Claude projects directory
export const CLAUDE_PROJECTS_DIR = path.join(os.homedir(), ".claude", "projects");


export interface DefaultConfig {
  LOG: boolean;
  OPENAI_API_KEY: string;
  OPENAI_BASE_URL: string;
  OPENAI_MODEL: string;
}

export const DEFAULT_CONFIG: DefaultConfig = {
  LOG: false,
  OPENAI_API_KEY: "",
  OPENAI_BASE_URL: "",
  OPENAI_MODEL: "",
};
