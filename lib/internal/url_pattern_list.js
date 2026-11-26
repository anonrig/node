'use strict';

const {
  ObjectDefineProperties,
  SafeSet,
  SymbolToStringTag,
} = primordials;

const {
  URLPatternList: URLPatternListHandle,
  isURLPattern,
} = internalBinding('url_pattern');
const {
  ERR_INVALID_ARG_VALUE,
  ERR_INVALID_THIS,
} = require('internal/errors').codes;
const {
  emitExperimentalWarning,
  kEnumerableProperty,
} = require('internal/util');
const {
  createInterfaceConverter,
  createSequenceConverter,
  requiredArguments,
} = require('internal/webidl');

const kConstructorErrorPrefix = "Failed to construct 'URLPatternList'";

const toURLPatternSequence = createSequenceConverter(
  createInterfaceConverter('URLPattern', isURLPattern),
);

// https://github.com/whatwg/urlpattern/pull/166
class URLPatternList {
  #handle;

  constructor(patterns) {
    emitExperimentalWarning('URLPatternList');
    requiredArguments(arguments.length, 1, {
      prefix: kConstructorErrorPrefix,
    });
    const patternList = toURLPatternSequence(patterns, {
      prefix: kConstructorErrorPrefix,
      context: 'patterns',
    });

    const seen = new SafeSet();
    for (let i = 0; i < patternList.length; i++) {
      if (seen.has(patternList[i])) {
        throw new ERR_INVALID_ARG_VALUE(
          'patterns',
          patterns,
          'must not contain the same URLPattern more than once',
        );
      }
      seen.add(patternList[i]);
    }
    if (patternList.length === 0) {
      throw new ERR_INVALID_ARG_VALUE('patterns', patterns, 'must not be empty');
    }

    this.#handle = new URLPatternListHandle(patternList);
  }

  test(input = undefined, baseURL = undefined) {
    if (typeof this !== 'object' || this === null || !(#handle in this))
      throw new ERR_INVALID_THIS('URLPatternList');
    return this.#handle.test(input, baseURL);
  }

  exec(input = undefined, baseURL = undefined) {
    if (typeof this !== 'object' || this === null || !(#handle in this))
      throw new ERR_INVALID_THIS('URLPatternList');
    return this.#handle.exec(input, baseURL);
  }
}

ObjectDefineProperties(URLPatternList.prototype, {
  test: kEnumerableProperty,
  exec: kEnumerableProperty,
  [SymbolToStringTag]: {
    __proto__: null,
    configurable: true,
    value: 'URLPatternList',
  },
});

module.exports = {
  URLPatternList,
};
