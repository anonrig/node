'use strict';

const {
  JSONParse,
  JSONStringify,
  SafeMap,
} = primordials;
const { internalModuleReadJSON } = internalBinding('fs');
const { pathToFileURL } = require('url');
const { toNamespacedPath } = require('path');

const cache = new SafeMap();

let manifest;

/**
 * Returns undefined for all failure cases.
 * @param {string} jsonPath
 */
function read(jsonPath) {
  if (cache.has(jsonPath)) {
    return cache.get(jsonPath);
  }

  const {
    0: includes_keys,
    1: name,
    2: main,
    3: exports,
    4: imports,
    5: type,
    6: shouldParseExports,
    7: shouldParseImports,
  } = internalModuleReadJSON(
    toNamespacedPath(jsonPath),
  );

  let result;

  if (includes_keys !== undefined) {
    result = { name, main, exports, imports, type, includes_keys };

    // Execute JSONParse on demand for improving performance
    if (shouldParseExports) {
      result.exports = JSONParse(exports);
    }

    if (shouldParseImports) {
      result.imports = JSONParse(imports);
    }
  }

  const { getOptionValue } = require('internal/options');
  if (name !== undefined) {
    if (manifest === undefined) {
      manifest = getOptionValue('--experimental-policy') ?
        require('internal/process/policy').manifest :
        null;
    }
    if (manifest !== null) {
      const jsonURL = pathToFileURL(jsonPath);
      manifest.assertIntegrity(jsonURL, JSONStringify(result));
    }
  }
  cache.set(jsonPath, result);
  return result;
}

module.exports = { read };
