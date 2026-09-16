/**
 * The JSON shape written by the `scan-exports` subcommand of the Expo Modules scanner (the
 * `ExpoModulesMacros-tool` executable shipped by `@expo/expo-modules-macros-plugin`). Field names
 * and spellings mirror its `Encodable` output exactly.
 */

/** The runtime category mirroring JavaScript's `typeof`. */
export type JSTypeof =
  | 'undefined'
  | 'object'
  | 'boolean'
  | 'number'
  | 'bigint'
  | 'string'
  | 'symbol'
  | 'function';

/** A Swift type parsed into a JS-oriented tagged tree. Every node except `unknown` carries `typeof`. */
export type TypeNode =
  | { kind: 'primitive'; name: string; typeof: JSTypeof }
  | { kind: 'optional'; wrapped: TypeNode; typeof?: JSTypeof }
  | { kind: 'array'; element: TypeNode; typeof?: JSTypeof }
  | { kind: 'dictionary'; key: TypeNode; value: TypeNode; typeof?: JSTypeof }
  | { kind: 'promise'; value: TypeNode; typeof?: JSTypeof }
  | {
      kind: 'function';
      parameters: TypeNode[];
      returns?: TypeNode;
      async: boolean;
      throws: boolean;
      typeof?: JSTypeof;
    }
  | { kind: 'ref'; name: string; typeof?: JSTypeof }
  | { kind: 'unknown'; text: string };

/** One parameter of a `@JS` function or `@JS init`. */
export type ExportedParameter = {
  /** The Swift argument label, or `_` when unlabeled. */
  label: string;
  /** The Swift internal parameter name. */
  name: string;
  type: TypeNode;
  /** True when the caller may omit it (a default value or an optional type). */
  optional: boolean;
};

/** One `@JS func` on a module or shared object. */
export type ExportedFunction = {
  /** The Swift declaration name. */
  name: string;
  /** The JS name it binds under. */
  jsName: string;
  parameters: ExportedParameter[];
  /** The return type; absent for `Void`. */
  returns?: TypeNode;
  async: boolean;
  throws: boolean;
  static: boolean;
};

/** One `@JS var` on a module or shared object. */
export type ExportedProperty = {
  name: string;
  jsName: string;
  /** The value type; absent when the scanner could not determine it from the declaration. */
  type?: TypeNode;
  readonly: boolean;
  static: boolean;
};

/** One `@Record` property. */
export type ExportedRecordProperty = {
  name: string;
  type: TypeNode;
  /** Optional-typed. */
  optional: boolean;
  /** Whether JS must supply it (neither optional nor defaulted). */
  required: boolean;
};

/** A `@ExpoModule` type and its `@JS` surface. */
export type ExportedModule = {
  name: string;
  jsName: string;
  functions: ExportedFunction[];
  properties: ExportedProperty[];
  /** Absolute path of the declaring Swift file. */
  file: string;
};

/** A `@SharedObject` type: a JS class with an optional `@JS init` constructor plus its `@JS` members. */
export type ExportedSharedObject = {
  name: string;
  jsName: string;
  /** The `@JS init` parameters; absent when the class declares none. */
  constructorParameters?: ExportedParameter[] | null;
  functions: ExportedFunction[];
  properties: ExportedProperty[];
  file: string;
};

/** A `@Record` type and its properties. */
export type ExportedRecord = {
  name: string;
  properties: ExportedRecordProperty[];
  file: string;
};

export type ExportedSurface = {
  modules: ExportedModule[];
  sharedObjects: ExportedSharedObject[];
  records: ExportedRecord[];
};

export type ScanStats = {
  durationMs: number;
  filesParsed: number;
  filesScanned: number;
};

export type ScanExportsResult = {
  exports: ExportedSurface;
  stats: ScanStats;
};
