import type { Command } from 'commander';
import { styleText } from 'node:util';
import path from 'path';

import { resolveScannerExecutable } from '../scanner/resolveScanner';
import { generateTypes } from '../typegen/generateTypes';

const DEFAULT_OUT_DIR = 'src';

type GenerateTypesCommandOptions = {
  outDir?: string;
  scanner?: string;
};

export function generateTypesCommand(cli: Command) {
  cli
    .command('generate-types [packageDir]')
    .description(
      'Generates TypeScript declarations for the native API an Expo module exports to JavaScript: ' +
        'its @ExpoModule, @SharedObject, and @Record types. Scans the package directory (default: the ' +
        'current directory) for Swift sources and writes one <ModuleName>.types.ts file per module.'
    )
    .option(
      '-o, --out-dir <dir>',
      'The directory to write the declaration files to, relative to the package directory.',
      DEFAULT_OUT_DIR
    )
    .option(
      '--scanner <path>',
      'Path to the Expo Modules scanner executable. Defaults to the one shipped with the ' +
        '@expo/expo-modules-macros-plugin package that expo-modules-core depends on.'
    )
    .action(async (packageDirArg: string | undefined, options: GenerateTypesCommandOptions) => {
      const packageDir = path.resolve(packageDirArg ?? '.');
      const outDir = path.resolve(packageDir, options.outDir ?? DEFAULT_OUT_DIR);
      const scannerPath = options.scanner
        ? path.resolve(options.scanner)
        : resolveScannerExecutable(packageDir);

      const result = await generateTypes({ packageDir, outDir, scannerPath });

      for (const warning of result.warnings) {
        const file = path.relative(packageDir, warning.file);
        console.warn(
          `${styleText('yellow', 'warn')} ${file}: ${warning.location}: ${warning.message}`
        );
      }

      for (const removedPath of result.removedPaths) {
        console.log(
          `Removed stale ${displayPath(removedPath)}: no exported module produces it anymore.`
        );
      }
      if (result.outputPaths.length === 0) {
        console.log(
          `No exported module found in ${packageDir} ` +
            `(${result.stats.filesScanned} Swift files scanned). Nothing was written.`
        );
        return;
      }
      const { modules, sharedObjects, records } = result.counts;
      const files = result.outputPaths.map((outputPath) =>
        styleText('bold', displayPath(outputPath))
      );
      console.log(
        `Generated ${files.join(', ')}: ` +
          `${modules} modules, ${sharedObjects} shared objects, ${records} records ` +
          `from ${result.stats.filesParsed} Swift files.`
      );
    });
}

/** Relative to the working directory when the file is inside it, absolute otherwise. */
function displayPath(filePath: string): string {
  const relative = path.relative(process.cwd(), filePath);
  return relative.startsWith('..') ? filePath : relative;
}
