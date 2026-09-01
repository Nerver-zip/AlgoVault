import test from "node:test"
import assert from "node:assert/strict"
import { build } from "esbuild"

const storage = new Map()
globalThis.chrome = {
  storage: {
    local: {
      get: async (keys) => {
        if (keys === null) return Object.fromEntries(storage)
        const names = typeof keys === "string" ? [keys] : Array.isArray(keys) ? keys : Object.keys(keys || {})
        return Object.fromEntries(names.map((key) => [key, storage.get(key)]))
      },
      set: async (values) => {
        Object.entries(values).forEach(([key, value]) => storage.set(key, value))
      },
      remove: async (keys) => {
        for (const key of (Array.isArray(keys) ? keys : [keys])) storage.delete(key)
      }
    },
    sync: {
      get: async () => ({}),
      set: async () => {},
      remove: async () => {}
    }
  }
}

storage.set("algovault.github.autoSync", true)
const bundledGithub = await build({
  entryPoints: [new URL("../lib/api/github.ts", import.meta.url).pathname],
  bundle: true,
  format: "esm",
  platform: "browser",
  write: false,
  define: { "process.env.PLASMO_PUBLIC_GITHUB_CLIENT_ID": "\"test-client\"" }
})
const { batchCommitToGithub } = await import(
  `data:text/javascript;charset=utf-8,${encodeURIComponent(bundledGithub.outputFiles[0].text)}`
)

function response(status, body = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  })
}

const writes = [
  { path: "Solutions/medium/3568/example.cpp", message: "export code", content: "int main() {}" },
  { path: "Solutions/medium/3568/metadata.json", message: "export metadata", content: "{}" }
]

test("atomic GitHub batch commit uses the latest tree and normalized credential", async () => {
  const originalFetch = globalThis.fetch
  const requests = []
  globalThis.fetch = async (url, init = {}) => {
    requests.push({ url, init })
    if (requests.length === 1) return response(200, { object: { sha: "commit-1" } })
    if (requests.length === 2) return response(200, { tree: { sha: "tree-1" } })
    if (requests.length === 3) return response(201, { sha: "tree-2" })
    if (requests.length === 4) return response(201, { sha: "commit-2" })
    return response(200, { ref: "refs/heads/main" })
  }

  try {
    const result = await batchCommitToGithub(
      '  "ghp_test"  ',
      "Nerver-zip/Leetcodes",
      writes,
      "main",
      undefined,
      { allowSequentialFallback: false }
    )
    assert.equal(result.ok, true)
    assert.equal(requests.length, 5)
    assert.equal(requests.every(({ init }) => init.headers.Authorization === "token ghp_test"), true)
    const treeBody = JSON.parse(requests[2].init.body)
    assert.equal(treeBody.base_tree, "tree-1")
    assert.deepEqual(treeBody.tree.map((entry) => entry.path), writes.map((entry) => entry.path))
    assert.equal(JSON.parse(requests[4].init.body).force, false)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test("atomic GitHub batch commit reports permissions without calling sequential fallback", async () => {
  const originalFetch = globalThis.fetch
  let calls = 0
  globalThis.fetch = async () => {
    calls += 1
    return response(403, { message: "Resource not accessible by integration" })
  }

  try {
    const result = await batchCommitToGithub(
      "ghp_test",
      "Nerver-zip/Leetcodes",
      writes,
      "main",
      undefined,
      { allowSequentialFallback: false }
    )
    assert.equal(result.ok, false)
    assert.equal(result.revoked, false)
    assert.match(result.message, /permission|branch/i)
    assert.equal(calls, 1)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test("atomic GitHub batch commit handles a concurrent ref update through merge", async () => {
  const originalFetch = globalThis.fetch
  const urls = []
  globalThis.fetch = async (url) => {
    urls.push(url)
    if (urls.length < 5) {
      if (urls.length === 1) return response(200, { object: { sha: "commit-1" } })
      if (urls.length === 2) return response(200, { tree: { sha: "tree-1" } })
      if (urls.length === 3) return response(201, { sha: "tree-2" })
      return response(201, { sha: "commit-2" })
    }
    if (url.endsWith("/git/refs/heads/main")) return response(409, { message: "Update is not a fast forward" })
    return response(201, { sha: "merge-1" })
  }

  try {
    const result = await batchCommitToGithub(
      "ghp_test",
      "Nerver-zip/Leetcodes",
      writes,
      "main",
      undefined,
      { allowSequentialFallback: false }
    )
    assert.equal(result.ok, true)
    assert.equal(urls.at(-1).endsWith("/merges"), true)
  } finally {
    globalThis.fetch = originalFetch
  }
})
