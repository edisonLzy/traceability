/**
 * A tiny module whose only purpose is to be a **recognizable named location**
 * in the built bundle. The idea is: after `vite build` minifies everything,
 * the SDK's stack frames point at `assets/index-<hash>.js:1:<col>` — utterly
 * illegible. Once we upload the accompanying source map keyed by the injected
 * debug_id, the server rewrites those frames to
 * `src/previewFailure.ts:triggerBoom` etc., proving the pipeline works.
 *
 * The nested call is deliberate: multiple frames make the "before / after"
 * demo more convincing than a single flat throw.
 */
export function throwProductionSourcemapError(): never {
  return triggerBoom();
}

function triggerBoom(): never {
  return raise("simulated production error via source map");
}

function raise(message: string): never {
  throw new Error(message);
}
