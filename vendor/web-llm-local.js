// web-llm-local.js: WebLLM, but the Gemma model comes from this repo's models/ folder, not from Hugging Face.
// Same API as the CDN version (CreateMLCEngine etc.): only the import path changes. Needs no internet.
// If the models/ folder is not there (GitHub Pages has a 1 GB site limit, so it cannot hold the model), it falls back to Hugging Face.
import * as webllm from "./web-llm.js";
export * from "./web-llm.js";

const ID = "gemma-2-2b-it-q4f16_1-MLC";
const dir = new URL(`../models/${ID}/`, import.meta.url);
const base = new URL("resolve/main/", dir).href;  // WebLLM expects a Hugging Face style .../resolve/main/ folder

// 1. Point the model and its WASM at the local copy. CreateMLCEngine reads prebuiltAppConfig by default.
const entry = webllm.prebuiltAppConfig.model_list.find(m => m.model_id === ID);
const hf = { model: entry.model, model_lib: entry.model_lib };  // the original Hugging Face and GitHub addresses, for the fallback
const local = { model: base, model_lib: new URL("gemma-2-2b-it-q4f16_1_cs1k-webgpu.wasm", dir).href };
Object.assign(entry, local);

let here;  // is the model folder next to this page? asked once
const modelIsHere = () => here ??= fetch(new URL("tensor-cache.json", base), { method: "HEAD" }).then(r => r.ok, () => false);

// 2. params_shard_0.bin (295 MB) is over GitHub's 100 MB file limit, so the repo stores it as six pieces.
// Join them once and put the result in the browser cache under the URL WebLLM checks first.
const PIECES = 6;
async function joinShard0() {
  if (!self.caches) throw new Error("Open this page through Live Server (http://localhost...), not by double-clicking the file.");
  const cache = await caches.open("webllm/model");
  const url = new URL("params_shard_0.bin", base).href;
  if (await cache.match(url)) return;  // joined on an earlier visit
  const parts = await Promise.all(Array.from({ length: PIECES }, (_, i) =>
    fetch(`${url}.part${i + 1}`).then(r => { if (!r.ok) throw new Error(`Missing model file ${url}.part${i + 1} (${r.status}). Is the models/ folder in the repo?`); return r.blob(); })));
  await cache.put(url, new Response(new Blob(parts)));
}

export async function CreateMLCEngine(id, config, chatOpts) {
  if (id === ID) {
    if (await modelIsHere()) {
      Object.assign(entry, local);
      config?.initProgressCallback?.({ progress: 0, timeElapsed: 0, text: "Reading the model files from this folder..." });
      await joinShard0();
    } else Object.assign(entry, hf);  // no models/ folder: download from Hugging Face instead
  }
  return webllm.CreateMLCEngine(id, config, chatOpts);
}
