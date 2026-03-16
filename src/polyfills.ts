/**
 * This file includes polyfills needed by Angular and is loaded before the app.
 * To add polyfills, add them to this file.
 */

import 'zone.js';  // Included with Angular CLI.

declare var require: any;

(window as any).global = window;
(window as any).process = {
  env: { DEBUG: undefined },
  version: '',
  nextTick: (fn: any) => setTimeout(fn, 0),
};
(window as any).Buffer = (window as any).Buffer || require('buffer').Buffer;
