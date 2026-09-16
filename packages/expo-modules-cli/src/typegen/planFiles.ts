import type {
  ExportedFunction,
  ExportedModule,
  ExportedParameter,
  ExportedProperty,
  ExportedRecord,
  ExportedSharedObject,
  ExportedSurface,
  TypeNode,
} from '../scanner/types';
import { isIdentifier } from './identifiers';
import type { ExternalTypes } from './renderSurface';

export type PlannedFile = {
  module: ExportedModule;
  /** The file name inside the output directory: the module's JS name plus `.types.ts`. */
  fileName: string;
  /** The module together with the shared objects and records it owns. */
  surface: ExportedSurface;
  /** Types this file references but another planned file declares. */
  externalTypes: ExternalTypes;
};

export type SkippedModule = {
  module: ExportedModule;
  /** Its JS name is already taken by an earlier module, or cannot name a TypeScript class and file. */
  reason: 'duplicate-js-name' | 'invalid-identifier';
};

export type FilePlan = {
  files: PlannedFile[];
  /** Modules that get no file, in scan order. */
  skippedModules: SkippedModule[];
  /** Declarations no module owns, which therefore have no file to be written to. */
  unassigned: { sharedObjects: ExportedSharedObject[]; records: ExportedRecord[] };
};

/**
 * Splits a scanned surface into one file per exported module. A package with a single module owns
 * every shared object and record in it. With several modules, each module owns the declarations
 * reachable from its signatures (transitively through the signatures of what it reaches), and the
 * first module in scan order wins a declaration that several reach. A file that references a
 * declaration owned by another file imports it from there. A module whose JS name is not an
 * identifier, or repeats an earlier module's, is skipped so no file is invalid or overwritten.
 */
export function planFiles(surface: ExportedSurface): FilePlan {
  const skippedModules: SkippedModule[] = [];
  const seenJsNames = new Set<string>();
  const modules = surface.modules.filter((module) => {
    if (!isIdentifier(module.jsName)) {
      skippedModules.push({ module, reason: 'invalid-identifier' });
      return false;
    }
    if (seenJsNames.has(module.jsName)) {
      skippedModules.push({ module, reason: 'duplicate-js-name' });
      return false;
    }
    seenJsNames.add(module.jsName);
    return true;
  });

  const sharedObjectsByName = new Map(surface.sharedObjects.map((s) => [s.name, s]));
  const recordsByName = new Map(surface.records.map((r) => [r.name, r]));
  const declarationNamed = (name: string) =>
    sharedObjectsByName.get(name) ?? recordsByName.get(name);

  // Swift type name -> index of the owning module.
  const owners = new Map<string, number>();
  if (modules.length === 1) {
    for (const name of [...sharedObjectsByName.keys(), ...recordsByName.keys()]) {
      owners.set(name, 0);
    }
  } else {
    modules.forEach((module, index) => {
      const pending = [...refsOfMembers(module)];
      while (pending.length > 0) {
        const name = pending.pop()!;
        const declaration = declarationNamed(name);
        if (!declaration || owners.has(name)) {
          continue;
        }
        owners.set(name, index);
        pending.push(...refsOfMembers(declaration));
      }
    });
  }

  const files = modules.map((module, index): PlannedFile => {
    const sharedObjects = surface.sharedObjects.filter((s) => owners.get(s.name) === index);
    const records = surface.records.filter((r) => owners.get(r.name) === index);

    const externalTypes: ExternalTypes = {};
    const referenced = new Set<string>([
      ...refsOfMembers(module),
      ...sharedObjects.flatMap((s) => [...refsOfMembers(s)]),
      ...records.flatMap((r) => [...refsOfMembers(r)]),
    ]);
    for (const name of referenced) {
      const owner = owners.get(name);
      const ownerModule = owner === undefined ? undefined : modules[owner];
      const declaration = declarationNamed(name);
      if (owner === index || !ownerModule || !declaration) {
        continue;
      }
      externalTypes[name] = {
        name: 'jsName' in declaration ? declaration.jsName : declaration.name,
        from: `./${fileBaseName(ownerModule)}`,
      };
    }

    return {
      module,
      fileName: `${fileBaseName(module)}.ts`,
      surface: { modules: [module], sharedObjects, records },
      externalTypes,
    };
  });

  return {
    files,
    skippedModules,
    unassigned: {
      sharedObjects: surface.sharedObjects.filter((s) => !owners.has(s.name)),
      records: surface.records.filter((r) => !owners.has(r.name)),
    },
  };
}

function fileBaseName(module: ExportedModule): string {
  return `${module.jsName}.types`;
}

type HasMembers = {
  functions?: ExportedFunction[];
  properties?: ExportedProperty[] | ExportedRecord['properties'];
  constructorParameters?: ExportedParameter[] | null;
};

/** The Swift type names referenced anywhere in a declaration's signatures. */
function refsOfMembers(declaration: HasMembers): Set<string> {
  const refs = new Set<string>();
  for (const parameter of declaration.constructorParameters ?? []) {
    collectRefs(parameter.type, refs);
  }
  for (const fn of declaration.functions ?? []) {
    for (const parameter of fn.parameters) {
      collectRefs(parameter.type, refs);
    }
    if (fn.returns) {
      collectRefs(fn.returns, refs);
    }
  }
  for (const property of declaration.properties ?? []) {
    if (property.type) {
      collectRefs(property.type, refs);
    }
  }
  return refs;
}

function collectRefs(node: TypeNode, into: Set<string>): void {
  switch (node.kind) {
    case 'ref':
      into.add(node.name);
      return;
    case 'optional':
      collectRefs(node.wrapped, into);
      return;
    case 'array':
      collectRefs(node.element, into);
      return;
    case 'dictionary':
      collectRefs(node.key, into);
      collectRefs(node.value, into);
      return;
    case 'promise':
      collectRefs(node.value, into);
      return;
    case 'function':
      node.parameters.forEach((parameter) => collectRefs(parameter, into));
      if (node.returns) {
        collectRefs(node.returns, into);
      }
      return;
    case 'primitive':
    case 'unknown':
      return;
  }
}
