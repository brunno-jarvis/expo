import fs from 'fs';
import path from 'path';

import { scanExports } from '../scanner/runScanner';
import type { ScanStats } from '../scanner/types';
import { planFiles } from './planFiles';
import { GENERATED_HEADER_LINE, renderSurface, type RenderWarning } from './renderSurface';

export type GenerateTypesOptions = {
  /** The Expo module package to scan. Absolute. */
  packageDir: string;
  /** The directory to write the declaration files to. Absolute. */
  outDir: string;
  /** The scanner executable to run. */
  scannerPath: string;
};

export type GenerateTypesResult = {
  /** The files written, one per exported module, in scan order. Empty when nothing was written. */
  outputPaths: string[];
  /** Previously generated files in the output directory that no module produced this time. */
  removedPaths: string[];
  warnings: RenderWarning[];
  stats: ScanStats;
  counts: { modules: number; sharedObjects: number; records: number };
};

/**
 * Scans one Expo module package for its JS-exported native types and writes one TypeScript
 * declaration file per exported module, named after the module's JS name. Shared objects and
 * records land in the file of the module that owns them (see `planFiles`); the ones no module
 * reaches are reported and skipped. Nothing is written when the package exports no module. A file
 * this tool generated earlier that no module produced this time is removed, so a renamed or removed
 * module does not leave declarations behind.
 */
export async function generateTypes({
  packageDir,
  outDir,
  scannerPath,
}: GenerateTypesOptions): Promise<GenerateTypesResult> {
  const { exports: surface, stats } = await scanExports(scannerPath, [packageDir]);
  const counts = {
    modules: surface.modules.length,
    sharedObjects: surface.sharedObjects.length,
    records: surface.records.length,
  };

  const plan = planFiles(surface);
  const warnings: RenderWarning[] = plan.skippedModules.map(({ module, reason }) => ({
    file: module.file,
    location: module.name,
    message:
      reason === 'duplicate-js-name'
        ? `another module already uses the JS name '${module.jsName}', so this one was skipped`
        : `'${module.jsName}' is not a valid TypeScript identifier, so its declaration was skipped`,
  }));
  for (const declaration of [...plan.unassigned.sharedObjects, ...plan.unassigned.records]) {
    warnings.push({
      file: declaration.file,
      location: declaration.name,
      message: 'not reachable from any exported module, so it has no file to live in; skipped',
    });
  }

  const outputPaths: string[] = [];
  for (const file of plan.files) {
    const rendered = renderSurface(file.surface, { externalTypes: file.externalTypes });
    warnings.push(...rendered.warnings);
    if (rendered.source === null) {
      continue;
    }
    const outputPath = path.join(outDir, file.fileName);
    await fs.promises.mkdir(outDir, { recursive: true });
    await fs.promises.writeFile(outputPath, rendered.source);
    outputPaths.push(outputPath);
  }
  const removedPaths = await removeStaleFiles(outDir, new Set(outputPaths));
  return { outputPaths, removedPaths, warnings, stats, counts };
}

/** Deletes `*.types.ts` files in `outDir` that carry this tool's header but were not written now. */
async function removeStaleFiles(outDir: string, written: Set<string>): Promise<string[]> {
  let entries: string[];
  try {
    entries = await fs.promises.readdir(outDir);
  } catch {
    return [];
  }
  const removed: string[] = [];
  for (const entry of entries) {
    const filePath = path.join(outDir, entry);
    if (!entry.endsWith('.types.ts') || written.has(filePath)) {
      continue;
    }
    const content = await fs.promises.readFile(filePath, 'utf8');
    if (content.startsWith(GENERATED_HEADER_LINE)) {
      await fs.promises.unlink(filePath);
      removed.push(filePath);
    }
  }
  return removed;
}
