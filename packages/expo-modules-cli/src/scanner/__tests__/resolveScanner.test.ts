import fs from 'fs';
import os from 'os';
import path from 'path';

import { resolveScannerExecutable } from '../resolveScanner';

let tmpDir: string;

beforeEach(() => {
  // Node resolves through symlinks, and macOS places temp directories behind one (/var -> /private/var).
  tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'expo-modules-cli-')));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

/** Creates `<root>/<name>/package.json` and returns the package directory. */
function writePackage(root: string, name: string): string {
  const dir = path.join(root, name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name, version: '1.0.0' }));
  return dir;
}

/** Lays out a macros plugin package with its scanner executable under `root/node_modules`. */
function writeMacrosPlugin(root: string): string {
  const pluginDir = writePackage(
    path.join(root, 'node_modules'),
    '@expo/expo-modules-macros-plugin'
  );
  fs.mkdirSync(path.join(pluginDir, 'apple'));
  const toolPath = path.join(pluginDir, 'apple', 'ExpoModulesMacros-tool');
  fs.writeFileSync(toolPath, '', { mode: 0o755 });
  return toolPath;
}

describe(resolveScannerExecutable, () => {
  it('prefers the plugin installed for the expo-modules-core the package resolves', () => {
    const packageDir = writePackage(tmpDir, 'my-module');
    const coreDir = writePackage(path.join(packageDir, 'node_modules'), 'expo-modules-core');
    const toolPath = writeMacrosPlugin(coreDir);
    // A different copy reachable from the package itself must lose to core's own dependency.
    writeMacrosPlugin(packageDir);

    expect(resolveScannerExecutable(packageDir)).toBe(toolPath);
  });

  it('falls back to a plugin resolvable from the package when core is not installed', () => {
    const packageDir = writePackage(tmpDir, 'my-module');
    const toolPath = writeMacrosPlugin(packageDir);

    expect(resolveScannerExecutable(packageDir)).toBe(toolPath);
  });

  it('resolves expo-modules-core from a search path when the package has none', () => {
    const packageDir = writePackage(tmpDir, 'my-module');
    const projectDir = writePackage(tmpDir, 'project');
    const coreDir = writePackage(path.join(projectDir, 'node_modules'), 'expo-modules-core');
    const toolPath = writeMacrosPlugin(coreDir);

    expect(resolveScannerExecutable(packageDir, { searchPaths: [projectDir] })).toBe(toolPath);
  });

  it('explains how to fix a missing plugin', () => {
    const packageDir = writePackage(tmpDir, 'my-module');

    expect(() => resolveScannerExecutable(packageDir, { searchPaths: [] })).toThrow(
      /Could not locate the Expo Modules scanner/
    );
  });
});
