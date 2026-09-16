import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import type { ScanExportsResult } from './types';

const execFileAsync = promisify(execFile);

/** The report grows with the exported surface; Node's default of 1 MiB is too small a cap for it. */
const MAX_OUTPUT_BYTES = 64 * 1024 * 1024;

export type ScanOptions = {
  /** The platform the scanner runs on; only overridden by tests. */
  platform?: NodeJS.Platform;
};

/**
 * Runs the scanner's `scan-exports` subcommand over the given paths and returns the parsed report.
 * Each path may be a Swift file or a directory, which the scanner walks recursively while skipping
 * `node_modules`, `Pods`, `.build`, and `.git`.
 */
export async function scanExports(
  scannerPath: string,
  paths: string[],
  { platform = process.platform }: ScanOptions = {}
): Promise<ScanExportsResult> {
  const target = paths.join(', ');
  let stdout: string;
  try {
    ({ stdout } = await execFileAsync(scannerPath, ['scan-exports', ...paths], {
      maxBuffer: MAX_OUTPUT_BYTES,
    }));
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      throw new Error(
        `The Expo Modules scanner executable was not found at ${scannerPath}. ` +
          `It ships inside the "@expo/expo-modules-macros-plugin" package as a macOS binary. ` +
          `Reinstall your JavaScript dependencies, or pass the path to a locally built scanner with --scanner.`
      );
    }
    if (error.code === 'ENOEXEC' || error.code === 'EACCES') {
      throw new Error(
        `The Expo Modules scanner at ${scannerPath} could not be executed (${error.code}). ` +
          `The scanner shipped inside "@expo/expo-modules-macros-plugin" is a macOS binary, so this ` +
          `command runs on macOS only. On macOS, make sure the file is executable, or pass the path ` +
          `to a locally built scanner with --scanner.`
      );
    }
    // The scanner explains every failure on stderr, so its exit code adds nothing to the message.
    const diagnostics =
      typeof error.stderr === 'string' && error.stderr.trim() ? error.stderr.trim() : error.message;
    // Off macOS the binary cannot run at all, but the failure does not surface as ENOEXEC: libc hands
    // the file to /bin/sh, which fails with a syntax error. The hint names the likely cause.
    const platformHint =
      platform === 'darwin'
        ? ''
        : ` The scanner shipped inside "@expo/expo-modules-macros-plugin" is a macOS binary, so on ` +
          `${platform} this command needs a locally built scanner passed with --scanner.`;
    throw new Error(
      `The Expo Modules scanner failed to scan ${target}.${platformHint} ` +
        `Fix the problem it reports below, then run the command again.\n${diagnostics}`
    );
  }

  let result: unknown;
  try {
    result = JSON.parse(stdout);
  } catch {
    throw new Error(
      `The Expo Modules scanner output for ${target} is not valid JSON, so the scanner at ${scannerPath} ` +
        `is likely a version this CLI does not understand. Update "@expo/expo-modules-macros-plugin" and ` +
        `"@expo/modules-cli" to matching releases and run the command again.`
    );
  }
  if (!isScanExportsResult(result)) {
    throw new Error(
      `The Expo Modules scanner output for ${target} does not contain the expected "exports" and "stats" ` +
        `fields. Make sure the executable at ${scannerPath} is the Expo Modules scanner and supports ` +
        `the scan-exports subcommand (run it with --help to check).`
    );
  }
  return result;
}

function isScanExportsResult(value: unknown): value is ScanExportsResult {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as ScanExportsResult).exports === 'object' &&
    typeof (value as ScanExportsResult).stats === 'object'
  );
}
