import * as core from "@actions/core";
import {
  getVersion,
  assetUrl,
  fetchAndInstall,
  checkBinary,
  validateSubscription,
} from "./installer";

const OWNER = "bytecodealliance";
const REPO = "wasm-tools";

async function main(): Promise<void> {
  try {
    await validateSubscription();

    const tag = await getVersion(OWNER, REPO);

    // tags may carry a "wasm-tools-" prefix; strip it to get the bare semver
    const version = tag.replace("wasm-tools-", "").replace(/^v/, "");

    let downloadUrl: string;
    try {
      downloadUrl = await assetUrl(OWNER, REPO, `v${version}`);
    } catch {
      // fall back to legacy tag format
      downloadUrl = await assetUrl(OWNER, REPO, `wasm-tools-${version}`);
    }

    await fetchAndInstall("wasm-tools", version, downloadUrl);
    await checkBinary("wasm-tools");
  } catch (error) {
    if (error instanceof Error) core.setFailed(error.message);
  }
}

main();
