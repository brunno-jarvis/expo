import fs from 'fs';
import os from 'os';
import path from 'path';

import { scanExports } from '../runScanner';

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'expo-modules-cli-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

/** An executable Node script that prints `stderr` and exits with `exitCode`. */
function writeFailingScanner(stderr: string, exitCode: number): string {
  const scannerPath = path.join(tmpDir, 'fake-scanner');
  fs.writeFileSync(
    scannerPath,
    `#!/usr/bin/env node\nprocess.stderr.write(${JSON.stringify(stderr)});\nprocess.exitCode = ${exitCode};\n`,
    { mode: 0o755 }
  );
  return scannerPath;
}

describe(scanExports, () => {
  it('relays the scanner diagnostics on macOS without a platform hint', async () => {
    const scannerPath = writeFailingScanner('error: no such file\n', 1);

    await expect(scanExports(scannerPath, ['/pkg'], { platform: 'darwin' })).rejects.toThrow(
      expect.objectContaining({
        message: expect.stringContaining('error: no such file'),
      })
    );
    await expect(scanExports(scannerPath, ['/pkg'], { platform: 'darwin' })).rejects.not.toThrow(
      /macOS binary/
    );
  });

  it('adds a platform hint on other platforms, where the macOS binary fails through the shell', async () => {
    // On Linux, glibc hands a binary the kernel rejects to /bin/sh, which fails with a syntax error.
    const scannerPath = writeFailingScanner('Syntax error: word unexpected\n', 2);

    await expect(scanExports(scannerPath, ['/pkg'], { platform: 'linux' })).rejects.toThrow(
      /macOS binary/
    );
  });
});
