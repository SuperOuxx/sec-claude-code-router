/**
 * Install preset from GitHub marketplace
 * sec-ccr install {presetname}
 */

import { installPresetFromMarket } from './preset/install-github';
import { applyPresetCli } from './preset/install';

// ANSI color codes
const RESET = "\x1B[0m";
const GREEN = "\x1B[32m";
const YELLOW = "\x1B[33m";
const BOLDGREEN = "\x1B[1m\x1B[32m";
const BOLDYELLOW = "\x1B[1m\x1B[33m";
const BOLDCYAN = "\x1B[1m\x1B[36m";
const DIM = "\x1B[2m";

/**
 * Install preset from marketplace by preset name
 * @param presetName Preset name (must exist in marketplace)
 */
export async function handleInstallCommand(presetName: string): Promise<void> {
  try {
    const cliName = process.env.SEC_CCR_CLI_NAME || "sec-ccr";
    if (!presetName) {
      console.error(`\n${BOLDYELLOW}Error:${RESET} Preset name is required\n`);
      console.error(`Usage: ${cliName} install <preset-name>\n`);
      console.error('Examples:');
      console.error(`  ${cliName} install my-preset`);
      console.error(`  ${cliName} install awesome-preset\n`);
      console.error(`${DIM}Note: Preset must exist in the official marketplace.${RESET}\n`);
      process.exit(1);
    }

    console.log(`${BOLDCYAN}Installing preset:${RESET} ${presetName}\n`);

    // Install preset (download and extract)
    const { name: installedName, preset } = await installPresetFromMarket(presetName);

    if (installedName && preset) {
      // Apply preset configuration (interactive setup)
      await applyPresetCli(installedName, preset);

      console.log(`\n${BOLDGREEN}✓ Preset installation completed!${RESET}\n`);
    }

  } catch (error: any) {
    console.error(`\n${BOLDYELLOW}Failed to install preset:${RESET} ${error.message}\n`);
    process.exit(1);
  }
}
