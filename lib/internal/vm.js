'use strict';

const {
  ArrayPrototypeForEach,
} = primordials;

const {
  compileFunction,
  isContext: _isContext,
} = internalBinding('contextify');
const {
  validateArray,
  validateBoolean,
  validateBuffer,
  validateFunction,
  validateObject,
  validateString,
  validateStringArray,
  kValidateObjectAllowArray,
  kValidateObjectAllowNullable,
  validateInt32,
} = require('internal/validators');
const {
  ERR_INVALID_ARG_TYPE,
} = require('internal/errors').codes;

/**
 * Checks if the given object is a context object.
 * @param {object} object - The object to check.
 * @returns {boolean} - Returns true if the object is a context object, else false.
 */
function isContext(object) {
  validateObject(object, 'object', kValidateObjectAllowArray);

  return _isContext(object);
}

/**
 * Compiles a function from the given code string.
 * @param {string} code - The code string to compile.
 * @param {string[]} [params] - An optional array of parameter names for the compiled function.
 * @param {object} [options] - An optional object containing compilation options.
 * @param {string} [options.filename=''] - The filename to use for the compiled function.
 * @param {number} [options.columnOffset=0] - The column offset to use for the compiled function.
 * @param {number} [options.lineOffset=0] - The line offset to use for the compiled function.
 * @param {Buffer} [options.cachedData=undefined] - The cached data to use for the compiled function.
 * @param {boolean} [options.produceCachedData=false] - Whether to produce cached data for the compiled function.
 * @param {ReturnType<import('vm').createContext} [options.parsingContext=undefined] - The parsing context to use for the compiled function.
 * @param {object[]} [options.contextExtensions=[]] - An array of context extensions to use for the compiled function.
 * @param {import('internal/modules/esm/utils').ImportModuleDynamicallyCallback} [options.importModuleDynamically] -
 * A function to use for dynamically importing modules.
 * @param {boolean} [options.shouldThrowOnError=true] - Whether to throw an error if the code contains syntax errors.
 * @returns {Object} An object containing the compiled function and any associated data.
 * @throws {TypeError} If any of the arguments are of the wrong type.
 * @throws {ERR_INVALID_ARG_TYPE} If the parsing context is not a valid context object.
 */
function internalCompileFunction(code, params, options) {
  validateString(code, 'code');
  if (params !== undefined) {
    validateStringArray(params, 'params');
  }

  const {
    filename = '',
    columnOffset = 0,
    lineOffset = 0,
    cachedData = undefined,
    produceCachedData = false,
    parsingContext = undefined,
    contextExtensions = [],
    importModuleDynamically,
    shouldThrowOnError = true,
  } = options;

  validateString(filename, 'options.filename');
  validateInt32(columnOffset, 'options.columnOffset');
  validateInt32(lineOffset, 'options.lineOffset');
  if (cachedData !== undefined)
    validateBuffer(cachedData, 'options.cachedData');
  validateBoolean(produceCachedData, 'options.produceCachedData');
  if (parsingContext !== undefined) {
    if (
      typeof parsingContext !== 'object' ||
      parsingContext === null ||
      !isContext(parsingContext)
    ) {
      throw new ERR_INVALID_ARG_TYPE(
        'options.parsingContext',
        'Context',
        parsingContext,
      );
    }
  }
  validateArray(contextExtensions, 'options.contextExtensions');
  ArrayPrototypeForEach(contextExtensions, (extension, i) => {
    const name = `options.contextExtensions[${i}]`;
    validateObject(extension, name, kValidateObjectAllowNullable);
  });
  validateBoolean(shouldThrowOnError, 'options.shouldThrowOnError');

  const result = compileFunction(
    code,
    filename,
    lineOffset,
    columnOffset,
    cachedData,
    produceCachedData,
    parsingContext,
    contextExtensions,
    params,
    shouldThrowOnError,
  );

  // If we're not supposed to throw on errors, and compilation errored, then return the error.
  if (!shouldThrowOnError && result != null && result instanceof Error) {
    return result;
  }

  if (produceCachedData) {
    result.function.cachedDataProduced = result.cachedDataProduced;
  }

  if (result.cachedData) {
    result.function.cachedData = result.cachedData;
  }

  if (typeof result.cachedDataRejected === 'boolean') {
    result.function.cachedDataRejected = result.cachedDataRejected;
  }

  if (importModuleDynamically !== undefined) {
    validateFunction(importModuleDynamically,
                     'options.importModuleDynamically');
    const { importModuleDynamicallyWrap } = require('internal/vm/module');
    const wrapped = importModuleDynamicallyWrap(importModuleDynamically);
    const func = result.function;
    const { registerModule } = require('internal/modules/esm/utils');
    registerModule(func, {
      __proto__: null,
      importModuleDynamically: wrapped,
    });
  }

  return result;
}

module.exports = {
  internalCompileFunction,
  isContext,
};
