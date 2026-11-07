/*
 * MangoDisk legacy-browser polyfills.
 *
 * macOS 10.13 (High Sierra) ships Safari 11 (2017 WebKit). The application's
 * modern JavaScript dependencies rely on runtime methods that Safari 11 does
 * not provide. esbuild/rolldown only lower syntax to the configured target;
 * they do not inject these runtime methods, so we install minimal, guarded
 * replacements before the application bundle executes.
 *
 * Every patch is guarded by an existence check, so modern macOS versions keep
 * their native implementations untouched. The script is intentionally written
 * in conservative syntax so it can parse and run on the oldest supported
 * WebKit.
 *
 * Loaded as a classic <script> (not type="module") from every HTML entry so it
 * executes synchronously before the deferred application bundle.
 */
(function () {
  'use strict';

  var globalScope = typeof globalThis !== 'undefined'
    ? globalThis
    : (typeof window !== 'undefined' ? window : this);

  function definePolyfill(target, name, value) {
    var current = target[name];
    if (current !== undefined && current !== null) {
      return;
    }
    Object.defineProperty(target, name, {
      value: value,
      writable: true,
      configurable: true,
      enumerable: false
    });
  }

  function flattenInto(target, source, depth) {
    var length = source.length;
    for (var i = 0; i < length; i += 1) {
      var item = source[i];
      if (Array.isArray(item) && depth > 0) {
        flattenInto(target, item, depth - 1);
      } else {
        target.push(item);
      }
    }
    return target;
  }

  definePolyfill(Array.prototype, 'flat', function flat(depth) {
    var result = [];
    var level = depth === undefined ? 1 : depth;
    flattenInto(result, this, level);
    return result;
  });

  definePolyfill(Array.prototype, 'flatMap', function flatMap(mapper, thisArg) {
    var result = [];
    for (var i = 0; i < this.length; i += 1) {
      var mapped = mapper.call(thisArg, this[i], i, this);
      if (Array.isArray(mapped)) {
        flattenInto(result, mapped, 1);
      } else {
        result.push(mapped);
      }
    }
    return result;
  });

  definePolyfill(Array.prototype, 'at', function at(offset) {
    var length = this.length;
    var index = offset < 0 ? length + offset : offset;
    return this[index];
  });

  definePolyfill(Array.prototype, 'findLast', function findLast(predicate, thisArg) {
    for (var i = this.length - 1; i >= 0; i -= 1) {
      if (predicate.call(thisArg, this[i], i, this)) {
        return this[i];
      }
    }
    return undefined;
  });

  definePolyfill(Array.prototype, 'findLastIndex', function findLastIndex(predicate, thisArg) {
    for (var i = this.length - 1; i >= 0; i -= 1) {
      if (predicate.call(thisArg, this[i], i, this)) {
        return i;
      }
    }
    return -1;
  });

  definePolyfill(Object, 'fromEntries', function fromEntries(iterable) {
    var result = {};
    var iterator = iterable[Symbol.iterator]();
    var step = iterator.next();
    while (!step.done) {
      var entry = step.value;
      result[entry[0]] = entry[1];
      step = iterator.next();
    }
    return result;
  });

  definePolyfill(String.prototype, 'replaceAll', function replaceAll(pattern, replacement) {
    var string = String(this);
    if (pattern instanceof RegExp) {
      if (!pattern.global) {
        var flags = 'g' + (pattern.ignoreCase ? 'i' : '') + (pattern.multiline ? 'm' : '');
        pattern = new RegExp(pattern.source, flags);
      }
      return string.replace(pattern, replacement);
    }
    var target = String(pattern).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return string.replace(new RegExp(target, 'g'), replacement);
  });

  function randomHex(byteCount) {
    var cryptoObj = typeof crypto !== 'undefined' ? crypto : null;
    var bytes = new Uint8Array(byteCount);
    if (cryptoObj && typeof cryptoObj.getRandomValues === 'function') {
      cryptoObj.getRandomValues(bytes);
    } else {
      for (var i = 0; i < byteCount; i += 1) {
        bytes[i] = Math.floor(Math.random() * 256);
      }
    }
    var hex = '';
    for (var j = 0; j < byteCount; j += 1) {
      var byte = bytes[j];
      hex += byte.toString(16).padStart(2, '0');
    }
    return hex;
  }

  function fallbackRandomUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (character) {
      var random = Math.floor(Math.random() * 16);
      var value = character === 'x' ? random : (random & 0x3) | 0x8;
      return value.toString(16);
    });
  }

  var cryptoObj = typeof crypto !== 'undefined' ? crypto : null;
  if (cryptoObj && typeof cryptoObj.randomUUID !== 'function') {
    cryptoObj.randomUUID = fallbackRandomUUID;
  }

  function deepClone(value) {
    if (value === null || typeof value !== 'object') {
      return value;
    }
    if (Array.isArray(value)) {
      var arrayResult = [];
      for (var i = 0; i < value.length; i += 1) {
        arrayResult[i] = deepClone(value[i]);
      }
      return arrayResult;
    }
    if (value instanceof Date) {
      return new Date(value.getTime());
    }
    if (value instanceof RegExp) {
      var flags = '';
      if (value.global) {
        flags += 'g';
      }
      if (value.ignoreCase) {
        flags += 'i';
      }
      if (value.multiline) {
        flags += 'm';
      }
      return new RegExp(value.source, flags);
    }
    if (typeof Map !== 'undefined' && value instanceof Map) {
      var mapResult = new Map();
      value.forEach(function (mapValue, mapKey) {
        mapResult.set(deepClone(mapKey), deepClone(mapValue));
      });
      return mapResult;
    }
    if (typeof Set !== 'undefined' && value instanceof Set) {
      var setResult = new Set();
      value.forEach(function (setValue) {
        setResult.add(deepClone(setValue));
      });
      return setResult;
    }
    var objectResult = {};
    var keys = Object.keys(value);
    for (var j = 0; j < keys.length; j += 1) {
      objectResult[keys[j]] = deepClone(value[keys[j]]);
    }
    return objectResult;
  }

  definePolyfill(globalScope, 'structuredClone', deepClone);

  // --- Host-object API shims (Safari 11 / WebKit 13605) ---
  // reka-ui and other modern UI libraries depend on ResizeObserver
  // (Safari 13.1) and IntersectionObserver (Safari 12.1) to lay out and
  // position components, and on the Web Animations API (Safari 13.1) for
  // transitions. None exist on 10.13, so components throw while mounting and
  // the window renders blank. These guarded shims let the app render; on
  // newer macOS the native APIs are present and these are skipped entirely.

  function emitResize(observer, target) {
    if (typeof observer._callback !== 'function') { return; }
    var rect = (target && target.getBoundingClientRect)
      ? target.getBoundingClientRect()
      : { width: 0, height: 0, top: 0, left: 0, right: 0, bottom: 0, x: 0, y: 0 };
    var entry = {
      target: target,
      contentRect: rect,
      borderBoxSize: [{ inlineSize: rect.width, blockSize: rect.height }],
      contentBoxSize: [{ inlineSize: rect.width, blockSize: rect.height }],
      devicePixelContentBoxSize: [{ inlineSize: rect.width, blockSize: rect.height }]
    };
    observer._callback([entry], observer);
  }

  if (typeof globalScope.ResizeObserver === 'undefined') {
    function LegacyResizeObserver(callback) {
      this._callback = callback;
      this._targets = [];
    }
    LegacyResizeObserver.prototype.observe = function (target) {
      if (this._targets.indexOf(target) !== -1) { return; }
      this._targets.push(target);
      emitResize(this, target);
    };
    LegacyResizeObserver.prototype.unobserve = function (target) {
      var idx = this._targets.indexOf(target);
      if (idx !== -1) { this._targets.splice(idx, 1); }
    };
    LegacyResizeObserver.prototype.disconnect = function () {
      this._targets = [];
    };
    globalScope.ResizeObserver = LegacyResizeObserver;
  }

  if (typeof globalScope.IntersectionObserver === 'undefined') {
    function LegacyIntersectionObserver(callback) {
      this._callback = callback;
    }
    LegacyIntersectionObserver.prototype.observe = function (target) {
      if (typeof this._callback !== 'function') { return; }
      var rect = (target && target.getBoundingClientRect)
        ? target.getBoundingClientRect()
        : { width: 0, height: 0, top: 0, left: 0, right: 0, bottom: 0 };
      var entry = {
        target: target,
        isIntersecting: true,
        intersectionRatio: 1,
        boundingClientRect: rect,
        intersectionRect: rect,
        rootBounds: null,
        time: 0
      };
      this._callback([entry], this);
    };
    LegacyIntersectionObserver.prototype.unobserve = function () {};
    LegacyIntersectionObserver.prototype.disconnect = function () {};
    LegacyIntersectionObserver.prototype.takeRecords = function () { return []; };
    globalScope.IntersectionObserver = LegacyIntersectionObserver;
  }

  if (typeof globalScope.Element !== 'undefined'
      && typeof globalScope.Element.prototype.animate !== 'function') {
    globalScope.Element.prototype.animate = function () {
      return {
        cancel: function () {},
        finish: function () {},
        play: function () {},
        pause: function () {},
        reverse: function () {},
        onfinish: null,
        oncancel: null,
        finished: Promise.resolve(),
        ready: Promise.resolve(),
        currentTime: 0,
        playState: 'finished',
        effect: null,
        timeline: null
      };
    };
  }

  if (typeof Promise.allSettled !== 'function') {
    Promise.allSettled = function (iterable) {
      return Promise.all(Array.prototype.map.call(iterable, function (value) {
        return Promise.resolve(value).then(
          function (v) { return { status: 'fulfilled', value: v }; },
          function (e) { return { status: 'rejected', reason: e }; }
        );
      }));
    };
  }

  if (typeof Promise.any !== 'function') {
    Promise.any = function (iterable) {
      return new Promise(function (resolve, reject) {
        var values = Array.prototype.slice.call(iterable);
        var errors = [];
        var remaining = values.length;
        if (remaining === 0) {
          reject(new Error('All promises were rejected'));
          return;
        }
        values.forEach(function (value, index) {
          Promise.resolve(value).then(resolve, function (error) {
            errors[index] = error;
            remaining -= 1;
            if (remaining === 0) {
              reject(new Error('All promises were rejected'));
            }
          });
        });
      });
    };
  }
})();
