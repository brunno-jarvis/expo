# @expo/modules-cli

Command-line tools for developing Expo modules, available as `expo-modules`.

## Commands

### `expo-modules generate-types [packageDir]`

Generates TypeScript declarations for the native API an Expo module exports to JavaScript. It scans the package's Swift sources for `@ExpoModule`, `@SharedObject`, and `@Record` types annotated with the Expo Modules macros and writes one declaration file per module, named after the module's JS name (`src/ExpoHaptics.types.ts` for a module named `ExpoHaptics`). Shared objects and records go into the file of the module that uses them.

```sh
expo-modules generate-types packages/expo-video
```

Options:

- `-o, --out-dir <dir>`: the directory to write the declaration files to, relative to the package directory. Defaults to `src`.
- `--scanner <path>`: path to the Expo Modules scanner executable. By default the command uses the one shipped with the `@expo/expo-modules-macros-plugin` package that `expo-modules-core` depends on.

A Swift type the scanner cannot express in TypeScript renders as `unknown`, and the command prints a warning naming the Swift file and member so the gap is visible.

The scan skips `node_modules`, `Pods`, `.build`, and `.git`, and also test and example directories (`Tests`, `UITests`, `__tests__`, `__mocks__`, `example`, `examples`, `e2e`), whose sources are not part of the package's product. A package that only declares modules in such directories, like the test fixtures in `expo-modules-core`, therefore generates nothing.

## Contributing

Contributions are very welcome! Please refer to guidelines described in the [contributing guide](https://github.com/expo/expo#contributing).
