/**
 * The engine is platform-agnostic: it runs in Node, Deno and the browser and
 * pulls in neither `@types/node` nor the DOM lib. These two globals are
 * standard in all three, so they are declared here rather than dragging a whole
 * type library in. This file is not emitted, so it cannot leak to consumers.
 */

declare function structuredClone<T>(value: T): T;

declare const crypto: {
  getRandomValues<T extends ArrayBufferView>(array: T): T;
};
