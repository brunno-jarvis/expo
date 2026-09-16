import type {
  ExportedModule,
  ExportedRecord,
  ExportedSharedObject,
  ExportedSurface,
  TypeNode,
} from '../../scanner/types';
import { planFiles } from '../planFiles';

const Str: TypeNode = { kind: 'primitive', name: 'String', typeof: 'string' };
const ref = (name: string): TypeNode => ({ kind: 'ref', name });
const FILE = '/pkg/ios/Demo.swift';

function module(name: string, refs: TypeNode[] = []): ExportedModule {
  return {
    name,
    jsName: name,
    file: FILE,
    properties: [],
    functions: refs.map((type, index) => ({
      name: `f${index}`,
      jsName: `f${index}`,
      parameters: [{ label: 'x', name: 'x', type, optional: false }],
      async: false,
      throws: false,
      static: false,
    })),
  };
}

function sharedObject(name: string, refs: TypeNode[] = []): ExportedSharedObject {
  return {
    name,
    jsName: name,
    file: FILE,
    constructorParameters: refs.map((type) => ({ label: 'x', name: 'x', type, optional: false })),
    functions: [],
    properties: [],
  };
}

function record(name: string, refs: TypeNode[] = []): ExportedRecord {
  return {
    name,
    file: FILE,
    properties: refs.map((type, index) => ({
      name: `p${index}`,
      type,
      optional: false,
      required: true,
    })),
  };
}

const fileNames = (plan: ReturnType<typeof planFiles>) => plan.files.map((file) => file.fileName);
const owned = (plan: ReturnType<typeof planFiles>, fileName: string) => {
  const file = plan.files.find((candidate) => candidate.fileName === fileName)!;
  return {
    sharedObjects: file.surface.sharedObjects.map((s) => s.name),
    records: file.surface.records.map((r) => r.name),
  };
};

describe(planFiles, () => {
  it('names each file after the JS name of its module', () => {
    const surface: ExportedSurface = {
      modules: [{ ...module('HapticsModule'), jsName: 'ExpoHaptics' }],
      sharedObjects: [],
      records: [],
    };
    expect(fileNames(planFiles(surface))).toEqual(['ExpoHaptics.types.ts']);
  });

  it('gives a single module every shared object and record, referenced or not', () => {
    const surface: ExportedSurface = {
      modules: [module('M')],
      sharedObjects: [sharedObject('Player')],
      records: [record('Options')],
    };
    const plan = planFiles(surface);
    expect(owned(plan, 'M.types.ts')).toEqual({ sharedObjects: ['Player'], records: ['Options'] });
    expect(plan.unassigned).toEqual({ sharedObjects: [], records: [] });
  });

  it('assigns declarations to the first module that reaches them through signatures', () => {
    const surface: ExportedSurface = {
      modules: [module('A', [ref('Player')]), module('B', [ref('Player'), ref('Extra')])],
      sharedObjects: [sharedObject('Player', [ref('Options')])],
      records: [record('Options', [ref('Nested')]), record('Nested'), record('Extra', [Str])],
    };
    const plan = planFiles(surface);
    expect(fileNames(plan)).toEqual(['A.types.ts', 'B.types.ts']);
    expect(owned(plan, 'A.types.ts')).toEqual({
      sharedObjects: ['Player'],
      records: ['Options', 'Nested'],
    });
    expect(owned(plan, 'B.types.ts')).toEqual({ sharedObjects: [], records: ['Extra'] });
    // B still references Player, so its file must import it from A's file.
    expect(plan.files[1]?.externalTypes).toEqual({
      Player: { name: 'Player', from: './A.types' },
    });
    expect(plan.files[0]?.externalTypes).toEqual({});
  });

  it('leaves declarations that no module reaches unassigned', () => {
    const surface: ExportedSurface = {
      modules: [module('A'), module('B')],
      sharedObjects: [sharedObject('Orphan')],
      records: [record('Loose')],
    };
    const plan = planFiles(surface);
    expect(plan.unassigned).toEqual({
      sharedObjects: [surface.sharedObjects[0]],
      records: [surface.records[0]],
    });
  });

  it('keeps the first of two modules sharing a JS name and reports the other', () => {
    const surface: ExportedSurface = {
      modules: [module('First'), { ...module('Second'), jsName: 'First' }],
      sharedObjects: [],
      records: [],
    };
    const plan = planFiles(surface);
    expect(fileNames(plan)).toEqual(['First.types.ts']);
    expect(plan.skippedModules).toEqual([
      { module: surface.modules[1], reason: 'duplicate-js-name' },
    ]);
  });

  it('skips a module whose JS name is not a valid identifier', () => {
    const surface: ExportedSurface = {
      modules: [{ ...module('M'), jsName: 'my module' }],
      sharedObjects: [],
      records: [],
    };
    const plan = planFiles(surface);
    expect(plan.files).toEqual([]);
    expect(plan.skippedModules).toEqual([
      { module: surface.modules[0], reason: 'invalid-identifier' },
    ]);
  });

  it('plans no files when the package declares no module', () => {
    const surface: ExportedSurface = {
      modules: [],
      sharedObjects: [],
      records: [record('Loose')],
    };
    const plan = planFiles(surface);
    expect(plan.files).toEqual([]);
    expect(plan.unassigned.records).toEqual([surface.records[0]]);
  });
});
