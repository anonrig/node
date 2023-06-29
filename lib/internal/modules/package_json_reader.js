'use strict';

const {
  JSONParse,
  ObjectPrototypeHasOwnProperty,
  SafeMap,
} = primordials;
const {
  ERR_INVALID_PACKAGE_CONFIG,
} = require('internal/errors').codes;
const { internalModuleReadJSON } = internalBinding('fs');
const { toNamespacedPath } = require('path');
const { kEmptyObject } = require('internal/util');

const { fileURLToPath, pathToFileURL } = require('internal/url');

const cache = new SafeMap();
const isAIX = process.platform === 'aix';

let manifest;

/**
 * @typedef {{
 *   exists: boolean,
 *   pjsonPath: string,
 *   exports?: string | string[] | Record<string, unknown>,
 *   imports?: string | string[] | Record<string, unknown>,
 *   name?: string,
 *   main?: string,
 *   type: 'commonjs' | 'module' | 'none',
 * }} PackageConfig
 */

/**
 * @param {string} jsonPath
 * @param {{
 *   base?: string,
 *   specifier: string,
 *   isESM: boolean,
 * }} options
 * @returns {PackageConfig}
 */
function read(jsonPath, { base, specifier, isESM } = kEmptyObject) {
  if (cache.has(jsonPath)) {
    return cache.get(jsonPath);
  }

  const {
    0: name,
    1: main,
    2: exports,
    3: imports,
    4: type,
    5: parseExports,
    6: parseImports,
    7: containsKeys,
  } = internalModuleReadJSON(
    toNamespacedPath(jsonPath),
  );
  const result = {
    __proto__: null,
    exists: false,
    pjsonPath: jsonPath,
    main,
    name,
    type, // Ignore unknown types for forwards compatibility
    exports,
    imports,
  };

  // Folder read operation succeeds in AIX.
  // For libuv change, see https://github.com/libuv/libuv/pull/2025.
  // https://github.com/nodejs/node/pull/48477#issuecomment-1604586650
  // TODO(anonrig): Follow-up on this change and remove it since it is a
  // semver-major change.
  const isResultValid = isAIX && !isESM ? containsKeys : type !== undefined;

  if (isResultValid) {
    if (parseExports) {
      result.exports = JSONParse(exports);
    }

    if (parseImports) {
      result.imports = JSONParse(imports);
    }

    result.exists = true;

    if (manifest === undefined) {
      const { getOptionValue } = require('internal/options');
      manifest = getOptionValue('--experimental-policy') ?
        require('internal/process/policy').manifest :
        null;
    }
    if (manifest !== null) {
      const jsonURL = pathToFileURL(jsonPath);
      manifest.assertIntegrity(jsonURL, string);
    }
  }
  cache.set(jsonPath, result);
  return result;
}

module.exports = { read };
