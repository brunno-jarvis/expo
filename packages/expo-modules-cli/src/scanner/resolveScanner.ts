import fs from 'fs';
import path from 'path';

const MACROS_PLUGIN_PACKAGE = '@expo/expo-modules-macros-plugin';

/** Relative to the macros plugin package root. The macro plugin executable doubles as the scanner. */
const SCANNER_PATH_IN_PLUGIN = path.join('apple', 'ExpoModulesMacros-tool');

export type ResolveScannerOptions = {
  /**
   * Directories to search, in order of preference. Defaults to the package directory, the working
   * directory, and this CLI's own location.
   */
  searchPaths?: string[];
};

/**
 * Locates the scanner executable for a package. The scanner is the macro plugin tool that
 * `expo-modules-core` depends on, so each search directory first tries the plugin installed for the
 * `expo-modules-core` it resolves: the scanner version then matches the macros the package compiles
 * against. A plugin resolvable directly from the directory is the fallback.
 */
export function resolveScannerExecutable(
  packageDir: string,
  { searchPaths = [packageDir, process.cwd(), __dirname] }: ResolveScannerOptions = {}
): string {
  const pluginDir = resolvePluginDir(searchPaths);
  if (!pluginDir) {
    throw new Error(
      `Could not locate the Expo Modules scanner for ${packageDir}. It ships inside the ` +
        `"${MACROS_PLUGIN_PACKAGE}" package, which is a dependency of "expo-modules-core", but neither ` +
        `resolved from that directory. Install "expo-modules-core" in the package (or run the command ` +
        `from a project that has it installed), or pass the path to a locally built scanner with --scanner.`
    );
  }

  const scannerPath = path.join(pluginDir, SCANNER_PATH_IN_PLUGIN);
  if (!fs.existsSync(scannerPath)) {
    throw new Error(
      `Found the "${MACROS_PLUGIN_PACKAGE}" package at ${pluginDir}, but it has no scanner executable at ` +
        `${SCANNER_PATH_IN_PLUGIN}. The installed copy may be incomplete or too old. Reinstall your ` +
        `JavaScript dependencies, or pass the path to a locally built scanner with --scanner.`
    );
  }
  return scannerPath;
}

/** The macros plugin directory found from the first search path that yields one. */
function resolvePluginDir(searchPaths: string[]): string | null {
  for (const searchPath of searchPaths) {
    const coreDir = resolvePackageDir('expo-modules-core', [searchPath]);
    const pluginDir = resolvePackageDir(
      MACROS_PLUGIN_PACKAGE,
      coreDir ? [coreDir, searchPath] : [searchPath]
    );
    if (pluginDir) {
      return pluginDir;
    }
  }
  return null;
}

/**
 * The real directory of the first copy of `packageName` installed in a `node_modules` folder at or
 * above any of `fromDirs`, in order. This walks the folders itself instead of calling
 * `require.resolve`: only the package location matters (not its `exports` map, which can hide
 * `package.json`), and the lookup stays scoped to those directories even under test runners and
 * bundlers that replace the module resolver.
 */
function resolvePackageDir(packageName: string, fromDirs: string[]): string | null {
  for (const fromDir of fromDirs) {
    for (const ancestor of ancestorsOf(path.resolve(fromDir))) {
      const candidate = path.join(ancestor, 'node_modules', packageName);
      if (fs.existsSync(path.join(candidate, 'package.json'))) {
        // Package managers link packages from a store, and the package's own dependencies live next
        // to the real location, not the link.
        return fs.realpathSync(candidate);
      }
    }
  }
  return null;
}

/** `dir` and each of its parents up to the filesystem root. */
function* ancestorsOf(dir: string): Generator<string> {
  let current = dir;
  while (true) {
    yield current;
    const parent = path.dirname(current);
    if (parent === current) {
      return;
    }
    current = parent;
  }
}
