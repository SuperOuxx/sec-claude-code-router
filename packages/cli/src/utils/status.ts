import { getServiceInfo } from "./processCheck";

export async function showStatus() {
  const info = await getServiceInfo();
  const cliName = process.env.SEC_CCR_CLI_NAME || "sec-ccr";

  console.log("\nClaude Code Router Status");
  console.log("=".repeat(40));

  if (info.running) {
    console.log("Status: Running");
    console.log(`Process ID: ${info.pid}`);
    console.log(`Port: ${info.port}`);
    console.log(`API Endpoint: ${info.endpoint}`);
    console.log(`PID File: ${info.pidFile}`);
    console.log("");
    console.log("Ready to use. Try:");
    console.log(`  ${cliName} code    # Start coding with Claude`);
    console.log(`  ${cliName} stop    # Stop the service`);
  } else {
    console.log("Status: Not Running");
    console.log("");
    console.log("To start the service:");
    console.log(`  ${cliName} start`);
  }

  console.log("");
}

