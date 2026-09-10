import test from "node:test"
import assert from "node:assert/strict"
import { build } from "esbuild"

globalThis.chrome = {
  cookies: {
    get: async () => null
  }
}

const bundle = await build({
  entryPoints: [new URL("../lib/api/leetcode.ts", import.meta.url).pathname],
  bundle: true,
  format: "esm",
  platform: "browser",
  write: false,
  define: {
    "process.env.PLASMO_PUBLIC_BACKEND_URL": "\"http://localhost:8080\""
  }
})
const api = await import(`data:text/javascript;charset=utf-8,${encodeURIComponent(bundle.outputFiles[0].text)}`)

test("language recovery query does not download unselected source code", async () => {
  const originalFetch = globalThis.fetch
  let query = ""
  globalThis.fetch = async (_url, init) => {
    query = JSON.parse(init.body).query
    return new Response(JSON.stringify({
      data: {
        s0: {
          lang: { name: "python3", verboseName: "Python3" },
          timestamp: 123
        }
      }
    }), { status: 200, headers: { "content-type": "application/json" } })
  }

  try {
    const details = await api.fetchSubmissionLanguagesBatch([42])
    assert.equal(details[0].lang.name, "python3")
    assert.doesNotMatch(query, /\bcode\b/)
    assert.match(query, /\blang\b/)
  } finally {
    globalThis.fetch = originalFetch
  }
})
