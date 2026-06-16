import * as core from "@actions/core";
import * as exec from "@actions/exec";
import * as fs from "fs";
import * as fse from "fs-extra";
import * as io from "@actions/io";
import * as os from "os";
import * as path from "path";
import * as tc from "@actions/tool-cache";
import axios, { isAxiosError } from "axios";
import { v4 as uuidv4 } from "uuid";
import { Octokit } from "@octokit/rest";

// --- platform / arch detection ---

const PLATFORM_MAP: Record<string, string> = {
  linux: "linux",
  win32: "windows",
  darwin: "macos",
  freebsd: "freebsd",
  openbsd: "openbsd",
};

const ARCH_MAP: Record<string, string> = {
  x64: "x86_64",
  arm64: "aarch64",
  riscv64: "riscv64gc",
};

function currentPlatform(): string {
  const p = os.platform();
  if (!PLATFORM_MAP[p]) throw new Error(`Unsupported platform: ${p}`);
  return PLATFORM_MAP[p];
}

function currentArch(): string {
  const a = os.arch();
  if (!ARCH_MAP[a]) throw new Error(`Unsupported architecture: ${a}`);
  return ARCH_MAP[a];
}

const TARGET_TRIPLE = `${currentArch()}-${currentPlatform()}`;

// --- archive format ---

const ArchiveKind = {
  None: "",
  TarXz: ".tar.xz",
  TarGz: ".tar.gz",
  Zip: ".zip",
  Tgz: ".tgz",
  SevenZ: ".7z",
} as const;
type ArchiveKind = (typeof ArchiveKind)[keyof typeof ArchiveKind];

function detectFormat(url: string): ArchiveKind {
  if (url.endsWith(ArchiveKind.TarGz)) return ArchiveKind.TarGz;
  if (url.endsWith(ArchiveKind.TarXz)) return ArchiveKind.TarXz;
  if (url.endsWith(ArchiveKind.Tgz)) return ArchiveKind.Tgz;
  if (url.endsWith(ArchiveKind.Zip)) return ArchiveKind.Zip;
  if (url.endsWith(ArchiveKind.SevenZ)) return ArchiveKind.SevenZ;
  return ArchiveKind.None;
}

function installBasePath(): string {
  let base: string;
  if (process.platform === "win32") {
    base = process.env["USERPROFILE"] || "C:\\";
  } else {
    base = process.platform === "darwin" ? "/Users" : "/home";
  }
  return path.join(base, os.userInfo().username, "downloader");
}

function installBinPath(): string {
  return path.join(installBasePath(), "bin");
}

// --- asset installer ---

class AssetInstaller {
  binaryName: string;
  url: string;
  pathInArchive: string;

  constructor(binaryName: string, url: string, pathInArchive: string) {
    this.binaryName = binaryName;
    this.url = url;
    this.pathInArchive = pathInArchive;
  }

  async run(): Promise<void> {
    this.ensureValid();
    core.info(`Downloading from ${this.url}`);
    const tempDir = path.join(os.tmpdir(), "tmp", "runner", uuidv4());
    core.info(`Staging in ${tempDir}`);
    await io.mkdirP(tempDir);
    const downloadPath = await tc.downloadTool(this.url);

    const fmt = detectFormat(this.url);
    if (fmt === ArchiveKind.None) {
      await this.deployBinary(downloadPath);
    } else {
      const extractors: Record<string, () => Promise<string>> = {
        [ArchiveKind.TarGz]: () => tc.extractTar(downloadPath, tempDir),
        [ArchiveKind.TarXz]: () => tc.extractTar(downloadPath, tempDir, "x"),
        [ArchiveKind.Tgz]: () => tc.extractTar(downloadPath, tempDir),
        [ArchiveKind.Zip]: () => tc.extractZip(downloadPath, tempDir),
        [ArchiveKind.SevenZ]: () => tc.extract7z(downloadPath, tempDir),
      };
      const archivePath = await extractors[fmt]();
      await this.deployBinary(path.join(archivePath, this.pathInArchive));
    }

    return io.rmRF(tempDir);
  }

  async deployBinary(src: string): Promise<void> {
    const binDir = installBinPath();
    await io.mkdirP(binDir);
    const dest = path.join(binDir, this.binaryName);
    core.info(`Installing ${src} → ${dest}`);
    if (!fse.existsSync(dest)) {
      fse.moveSync(src, dest);
    }
    if (process.platform !== "win32") {
      await exec.exec("chmod", ["+x", dest]);
    }
    core.addPath(binDir);
  }

  ensureValid(): void {
    if (!this.binaryName) {
      throw new Error('"binaryName" is required.');
    }
    if (detectFormat(this.url) !== ArchiveKind.None && !this.pathInArchive) {
      throw new Error('"pathInArchive" is required for archive URLs.');
    }
  }
}

// --- version resolution ---

export async function getVersion(owner: string, repo: string): Promise<string> {
  let version = core.getInput("version");
  if (!version || version === "latest") {
    version = await latestTag(owner, repo);
  }
  return version;
}

async function latestTag(owner: string, repo: string): Promise<string> {
  const token = core.getInput("github_token");
  const octokit = token ? new Octokit({ auth: token }) : new Octokit();
  core.info(
    `Resolving latest release for ${currentPlatform()}/${currentArch()}`
  );
  const iter = octokit.paginate.iterator(octokit.rest.repos.listReleases, {
    owner,
    repo,
  });
  for await (const page of iter) {
    const match = page.data.find(
      (r) =>
        !r.prerelease && r.assets.find((a) => a.name.includes(TARGET_TRIPLE))
    );
    if (match) return match.tag_name;
  }
  throw new Error(
    `No releases found for ${currentPlatform()}/${currentArch()}`
  );
}

export async function assetUrl(
  owner: string,
  repo: string,
  tag: string
): Promise<string> {
  const token = core.getInput("github_token");
  const octokit = token ? new Octokit({ auth: token }) : new Octokit();
  const release = await octokit.rest.repos.getReleaseByTag({
    owner,
    repo,
    tag,
  });
  if (!release) {
    throw new Error(`Release not found for tag '${tag}'`);
  }
  const ext = currentPlatform() === "windows" ? ".zip" : ".tar.";
  const asset = release.data.assets.find((a) =>
    a.name.includes(`${TARGET_TRIPLE}${ext}`)
  );
  if (!asset) {
    throw new Error(
      `No asset found for tag '${tag}' on ${currentPlatform()}/${currentArch()}`
    );
  }
  return asset.browser_download_url;
}

export async function fetchAndInstall(
  name: string,
  version: string,
  url: string
): Promise<void> {
  const ext = currentPlatform() === "windows" ? ".exe" : "";
  const installer = new AssetInstaller(
    `${name}${ext}`,
    url,
    `${name}-${version}-${TARGET_TRIPLE}/${name}${ext}`
  );
  await installer.run();
}

export async function checkBinary(name: string): Promise<void> {
  const result = await exec.getExecOutput(name, ["--version"]);
  if (result.exitCode !== 0) {
    throw new Error(
      `Verification failed for ${name}.\n[stdout: ${result.stdout}] [stderr: ${result.stderr}]`
    );
  }
  core.exportVariable(`${toEnvKey(name)}_VERSION`, result.stdout);
}

function toEnvKey(name: string): string {
  return name.toUpperCase().replace("-", "_");
}

// --- subscription check ---

export async function validateSubscription(): Promise<void> {
  const eventPath = process.env.GITHUB_EVENT_PATH;
  let repoPrivate: boolean | undefined;

  if (eventPath && fs.existsSync(eventPath)) {
    const eventData = JSON.parse(fs.readFileSync(eventPath, "utf8"));
    repoPrivate = eventData?.repository?.private;
  }

  const upstream = "bytecodealliance/actions";
  const action = process.env.GITHUB_ACTION_REPOSITORY;
  const docsUrl =
    "https://docs.stepsecurity.io/actions/stepsecurity-maintained-actions";

  core.info("");
  core.info("\u001b[1;36mStepSecurity Maintained Action\u001b[0m");
  core.info(`Secure drop-in replacement for ${upstream}`);
  if (repoPrivate === false)
    core.info("\u001b[32m\u2713 Free for public repositories\u001b[0m");
  core.info(`\u001b[36mLearn more:\u001b[0m ${docsUrl}`);
  core.info("");

  if (repoPrivate === false) return;

  const serverUrl = process.env.GITHUB_SERVER_URL || "https://github.com";
  const body: Record<string, string> = { action: action || "" };
  if (serverUrl !== "https://github.com") body.ghes_server = serverUrl;
  try {
    await axios.post(
      `https://agent.api.stepsecurity.io/v1/github/${process.env.GITHUB_REPOSITORY}/actions/maintained-actions-subscription`,
      body,
      { timeout: 3000 }
    );
  } catch (error) {
    if (isAxiosError(error) && error.response?.status === 403) {
      core.error(
        "\u001b[1;31mThis action requires a StepSecurity subscription for private repositories.\u001b[0m"
      );
      core.error(
        `\u001b[31mLearn how to enable a subscription: ${docsUrl}\u001b[0m`
      );
      process.exit(1);
    }
    core.info("Timeout or API not reachable. Continuing to next step.");
  }
}
