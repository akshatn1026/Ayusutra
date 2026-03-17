import 'zone.js'; 

declare var require: any;

(window as any).global = window;
(window as any).process = {
  env: { DEBUG: undefined },
  version: '',
  nextTick: (fn: any) => setTimeout(fn, 0),
};
(window as any).Buffer = (window as any).Buffer || require('buffer').Buffer;
