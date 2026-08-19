import fs from "fs"
import path from "path"

const BASE_DIR = path.resolve("../temp/leetcode-company-wise-problems-main")

function extractSlug(link) {
  if (!link) return ""
  const match = link.trim().match(/\/problems\/([^/?#]+)/)
  return match ? match[1].toLowerCase() : ""
}

function parseCsvLine(text) {
  const result = []
  let cur = ""
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (c === '"') {
      inQuotes = !inQuotes
    } else if (c === ',' && !inQuotes) {
      result.push(cur.trim())
      cur = ""
    } else {
      cur += c
    }
  }
  result.push(cur.trim())
  return result
}

function categorizeCompany(name) {
  const n = name.toLowerCase()
  if (["google", "meta", "amazon", "microsoft", "apple", "netflix"].includes(n)) return "big-tech"
  if (["citadel", "jane street", "two sigma", "de shaw", "goldman sachs", "bloomberg", "j.p. morgan", "morgan stanley", "optiver", "jump trading", "hudson river trading", "blackrock", "barclays", "bank of america", "drw", "worldquant", "tower research capital", "point72", "fidelity", "cme group", "sig", "squarepoint capital", "imc", "akuna capital", "virtu financial", "millennium", "bridgewater associates", "aqr capital management"].includes(n)) return "quant-finance"
  if (["stripe", "uber", "airbnb", "bytedance", "tiktok", "doordash", "snap", "pinterest", "palantir technologies", "coinbase", "robinhood", "snowflake", "databricks", "roblox", "figma", "notion", "brex", "instacart", "openai", "scale ai", "anthropic", "anduril", "rippling", "revolut", "chime", "bolt", "grab", "gojek", "swiggy", "zomato", "flipkart", "razorpay", "cred", "phonepe", "paytm", "meesho", "zepto", "blinkit"].includes(n)) return "unicorns"
  if (["salesforce", "oracle", "cisco", "adobe", "atlassian", "vmware", "intuit", "ibm", "servicenow", "sap", "paypal", "ebay", "x", "linkedin", "spotify", "twitter", "zoom", "twilio", "workday", "splunk", "intel", "amd", "nvidia", "qualcomm", "broadcom", "sony", "samsung", "siemens", "dell", "hp", "hpe", "walmart labs", "target", "shopify", "dropbox", "box", "reddit", "datadog", "cloudflare", "mongodb", "crowdstrike", "okta", "elastic", "hashicorp", "unity", "epic games", "electronic arts", "activision", "riot games", "infosys", "tcs", "wipro", "hcl", "cognizant", "accenture", "capgemini", "deloitte", "ey", "pwc", "kpmg", "mckinsey"].includes(n)) return "enterprise"
  return "other"
}

const DOMAIN_MAP = {
  "google": "google.com",
  "meta": "meta.com",
  "amazon": "amazon.com",
  "microsoft": "microsoft.com",
  "apple": "apple.com",
  "netflix": "netflix.com",
  "citadel": "citadel.com",
  "jane street": "janestreet.com",
  "two sigma": "twosigma.com",
  "de shaw": "deshaw.com",
  "goldman sachs": "goldmansachs.com",
  "bloomberg": "bloomberg.com",
  "j.p. morgan": "jpmorgan.com",
  "morgan stanley": "morganstanley.com",
  "stripe": "stripe.com",
  "uber": "uber.com",
  "airbnb": "airbnb.com",
  "bytedance": "bytedance.com",
  "tiktok": "tiktok.com",
  "openai": "openai.com",
  "anthropic": "anthropic.com",
  "databricks": "databricks.com",
  "snowflake": "snowflake.com",
  "palantir technologies": "palantir.com",
  "coinbase": "coinbase.com",
  "spotify": "spotify.com",
  "nvidia": "nvidia.com",
  "salesforce": "salesforce.com",
  "adobe": "adobe.com",
  "oracle": "oracle.com",
  "cisco": "cisco.com",
  "atlassian": "atlassian.com",
  "linkedin": "linkedin.com",
  "intel": "intel.com",
  "amd": "amd.com",
  "qualcomm": "qualcomm.com",
  "robinhood": "robinhood.com",
  "doordash": "doordash.com",
  "snap": "snap.com",
  "pinterest": "pinterest.com",
  "reddit": "reddit.com",
  "dropbox": "dropbox.com",
  "shopify": "shopify.com",
  "datadog": "datadoghq.com",
  "cloudflare": "cloudflare.com",
  "mongodb": "mongodb.com",
  "crowdstrike": "crowdstrike.com",
  "instacart": "instacart.com",
  "roblox": "roblox.com",
  "figma": "figma.com",
  "notion": "notion.so",
  "brex": "brex.com",
  "anduril": "anduril.com",
  "rippling": "rippling.com",
  "revolut": "revolut.com",
  "chime": "chime.com",
  "blackrock": "blackrock.com",
  "barclays": "barclays.com",
  "bank of america": "bankofamerica.com",
  "optiver": "optiver.com",
  "jump trading": "jumptrading.com",
  "hudson river trading": "hudsonrivertrading.com",
  "point72": "point72.com",
  "drw": "drw.com",
  "worldquant": "worldquant.com",
  "tower research capital": "tower-research.com",
  "fidelity": "fidelity.com",
  "cme group": "cmegroup.com",
  "sig": "sig.com",
  "squarepoint capital": "squarepoint-capital.com",
  "imc": "imc.com",
  "akuna capital": "akunacapital.com",
  "virtu financial": "virtu.com",
  "millennium": "mlp.com",
  "bridgewater associates": "bridgewater.com",
  "aqr capital management": "aqr.com"
}

const BRAND_COLORS = {
  "google": { bg: "#1a0e0e", border: "#ea4335", text: "#ea4335" },
  "meta": { bg: "#0a1428", border: "#0668e1", text: "#0668e1" },
  "amazon": { bg: "#1f1708", border: "#ff9900", text: "#ff9900" },
  "microsoft": { bg: "#0d1a24", border: "#00a4ef", text: "#00a4ef" },
  "apple": { bg: "#18181b", border: "#a1a1aa", text: "#f4f4f5" },
  "netflix": { bg: "#220808", border: "#e50914", text: "#e50914" },
  "citadel": { bg: "#061a12", border: "#10b981", text: "#10b981" },
  "jane street": { bg: "#061f18", border: "#34d399", text: "#34d399" },
  "two sigma": { bg: "#0c1524", border: "#38bdf8", text: "#38bdf8" },
  "bloomberg": { bg: "#221406", border: "#f59e0b", text: "#f59e0b" },
  "goldman sachs": { bg: "#0a192f", border: "#60a5fa", text: "#60a5fa" },
  "stripe": { bg: "#120e2e", border: "#635bff", text: "#818cf8" },
  "uber": { bg: "#18181b", border: "#52525b", text: "#fafafa" },
  "airbnb": { bg: "#260c0e", border: "#ff5a5f", text: "#ff5a5f" },
  "bytedance": { bg: "#061f24", border: "#00f2fe", text: "#00f2fe" },
  "tiktok": { bg: "#240a14", border: "#ee1d52", text: "#ee1d52" },
  "openai": { bg: "#061c16", border: "#10a37f", text: "#10a37f" },
  "anthropic": { bg: "#241606", border: "#d97706", text: "#d97706" },
  "databricks": { bg: "#240e06", border: "#ff3621", text: "#ff3621" },
  "snowflake": { bg: "#061824", border: "#29b5e8", text: "#29b5e8" },
  "palantir technologies": { bg: "#18181b", border: "#71717a", text: "#e4e4e7" },
  "coinbase": { bg: "#08142c", border: "#0052ff", text: "#0052ff" },
  "spotify": { bg: "#061c0e", border: "#1db954", text: "#1db954" },
  "nvidia": { bg: "#101e06", border: "#76b900", text: "#76b900" },
  "salesforce": { bg: "#061824", border: "#00a1e0", text: "#00a1e0" },
  "adobe": { bg: "#240606", border: "#ff0000", text: "#ff0000" },
  "oracle": { bg: "#240606", border: "#f80000", text: "#f80000" },
  "cisco": { bg: "#061824", border: "#1ba0d7", text: "#1ba0d7" },
  "atlassian": { bg: "#061226", border: "#0052cc", text: "#38bdf8" },
  "linkedin": { bg: "#061426", border: "#0a66c2", text: "#0a66c2" },
  "intel": { bg: "#061426", border: "#0071c5", text: "#0071c5" },
  "amd": { bg: "#1f0808", border: "#ed1c24", text: "#ed1c24" },
  "qualcomm": { bg: "#081428", border: "#3253dc", text: "#60a5fa" },
  "default": { bg: "#121214", border: "#3f3f46", text: "#dfa054" }
}

const LOGO_SVGS = {
  "google": `<svg viewBox="0 0 24 24"><path fill="#EA4335" d="M12 5c1.6 0 3 .6 4.1 1.7l3.1-3.1C17.3 1.8 14.8 1 12 1 7.5 1 3.7 3.6 1.9 7.3l3.7 2.9C6.5 7.3 9 5 12 5z"/><path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.7-.2-2.3H12v4.6h6.5c-.3 1.5-1.1 2.8-2.4 3.7l3.7 2.9c2.2-2 3.7-5 3.7-8.9z"/><path fill="#FBBC05" d="M5.6 14.8c-.3-.8-.4-1.8-.4-2.8 0-1 .1-2 .4-2.8L1.9 6.3C.7 8.7 0 10.3 0 12s.7 3.3 1.9 5.7l3.7-2.9z"/><path fill="#34A853" d="M12 23c3.2 0 6-1.1 8-3l-3.7-2.9c-1.1.7-2.5 1.2-4.3 1.2-3 0-5.5-2.3-6.4-5.2L1.9 16c1.8 3.7 5.6 7 10.1 7z"/></svg>`,
  "meta": `<svg viewBox="0 0 24 24" fill="#0668E1"><path d="M12 2.04c-5.5 0-10 4.49-10 10.02 0 5 3.66 9.15 8.44 9.9v-7H7.9v-2.9h2.54V9.85c0-2.51 1.49-3.89 3.78-3.89 1.09 0 2.23.19 2.23.19v2.47h-1.26c-1.24 0-1.63.77-1.63 1.56v1.88h2.78l-.45 2.9h-2.33v7a10 10 0 0 0 8.44-9.9c0-5.53-4.5-10.02-10-10.02z"/></svg>`,
  "amazon": `<svg viewBox="0 0 24 24" fill="#FF9900"><path d="M13.95 11.75c-1.8 0-3.35.4-3.35 2.15 0 1.25.85 1.95 2.1 1.95 1.7 0 2.75-1.1 2.75-2.55v-1.55h-1.5zm1.75-3.3v1.5c-.85-.95-2-1.5-3.55-1.5-2.75 0-4.65 1.9-4.65 4.5 0 2.5 1.75 4.45 4.5 4.45 1.6 0 2.85-.6 3.65-1.65l.15.85h2.1V8.45h-2.2zm7.1 10.8c-7.3 3.85-15.15 1.35-19.5-2.05-.35-.3-.05-.7.35-.45 4.1 2.45 11.25 4.3 17.85-.35.6-.45 1.15.15 1.3.85zm1.2-1.35c-.25-.3-.95-.45-1.9-.3-1 .15-2.1.75-2.25 1.05-.2.3.2.55.55.5 1.1-.15 2.8-.25 3.35-.95.2-.25.45-.1.25-.3z"/></svg>`,
  "microsoft": `<svg viewBox="0 0 24 24"><path fill="#F25022" d="M1 1h10v10H1z"/><path fill="#7FBA00" d="M13 1h10v10H13z"/><path fill="#00A4EF" d="M1 13h10v10H1z"/><path fill="#FFB900" d="M13 13h10v10H13z"/></svg>`,
  "apple": `<svg viewBox="0 0 24 24" fill="#E5E7EB"><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M15.97 6.38c.62-.75 1.04-1.8 0.93-2.85-.9.04-1.99.6-2.61 1.33-.55.63-1.03 1.67-.9 2.7 1 .08 2.03-.51 2.58-1.18z"/></svg>`,
  "netflix": `<svg viewBox="0 0 24 24" fill="#E50914"><path d="M4 0h4v19.5c-.8-.5-2.2-.9-4-1V0zm12 0h4v19.5c-.8-.5-2.2-.9-4-1V0zM8 0h4.5l3.5 19.5H12L8 0z"/></svg>`,
  "uber": `<svg viewBox="0 0 24 24" fill="#E5E7EB"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm5 11h-4v4h-2v-4H7v-2h4V7h2v4h4v2z"/></svg>`,
  "citadel": `<svg viewBox="0 0 24 24" fill="#10B981"><path d="M12 2L2 7v10l10 5 10-5V7L12 2zm0 2.8L19.2 8 12 11.6 4.8 8 12 4.8zM4 9.8l7 3.5v6.9L4 16.7V9.8zm9 10.4v-6.9l7-3.5v6.9l-7 3.5z"/></svg>`,
  "jane street": `<svg viewBox="0 0 24 24" fill="#34D399"><path d="M3 3h18v18H3V3zm16 16V5H5v14h14zm-4-4H9v-2h6v2zm0-4H9V9h6v2z"/></svg>`,
  "bloomberg": `<svg viewBox="0 0 24 24" fill="#F59E0B"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 15h-2v-6h2v6zm4 0h-2v-8h2v8z"/></svg>`,
  "goldman sachs": `<svg viewBox="0 0 24 24" fill="#60A5FA"><path d="M2 4h20v16H2V4zm2 2v12h16V6H4zm3 3h10v2H7V9zm0 4h7v2H7v-2z"/></svg>`,
  "bytedance": `<svg viewBox="0 0 24 24" fill="#00F2FE"><path d="M12.5 2C6.7 2 2 6.7 2 12.5S6.7 23 12.5 23 23 18.3 23 12.5 18.3 2 12.5 2zm4.3 10.8l-5.6 3.2c-.6.3-1.2-.1-1.2-.7V8.7c0-.6.6-1 1.2-.7l5.6 3.2c.5.3.5 1.1 0 1.4z"/></svg>`,
  "tiktok": `<svg viewBox="0 0 24 24" fill="#EE1D52"><path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64c.29 0 .58.04.85.12V9.41a6.33 6.33 0 0 0-.85-.06 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 10.82 4.46V11.2a8.16 8.16 0 0 0 5.63 2.24v-3.48a4.85 4.85 0 0 1-2.02-.27z"/></svg>`,
  "stripe": `<svg viewBox="0 0 24 24" fill="#635BFF"><path d="M13.976 9.15c-2.172-.806-3.356-1.426-3.356-2.409 0-.831.683-1.305 1.901-1.305 2.227 0 4.515.858 6.09 1.631l.89-5.494C18.252.975 15.697.5 12.521.5 6.766.5 2.76 3.655 2.76 8.528c0 5.445 4.544 6.84 8.789 8.271 2.378.802 3.197 1.489 3.197 2.457 0 1.01-.849 1.545-2.28 1.545-2.433 0-5.111-1.077-7.008-2.147l-.92 5.586c1.68.799 4.887 1.46 8.167 1.46 6.07 0 10.295-2.929 10.295-8.083 0-5.75-4.84-7.25-9.024-8.467z"/></svg>`,
  "airbnb": `<svg viewBox="0 0 24 24" fill="#FF5A5F"><path d="M12 1.5C9.8 1.5 8 3.3 8 5.5c0 3.2 4 8.5 4 8.5s4-5.3 4-8.5c0-2.2-1.8-4-4-4zm0 6c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm8 10.5c0 2.8-3.6 5-8 5s-8-2.2-8-5c0-1.8 1.5-3.3 3.8-4.2l1.2 2.2c-1.8.6-3 1.6-3 2 0 1.7 2.7 3 6 3s6-1.3 6-3c0-.4-1.2-1.4-3-2l1.2-2.2c2.3.9 3.8 2.4 3.8 4.2z"/></svg>`,
  "palantir technologies": `<svg viewBox="0 0 24 24" fill="#9CA3AF"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-1-13h2v6h-2zm0 8h2v2h-2z"/></svg>`,
  "salesforce": `<svg viewBox="0 0 24 24" fill="#00A1E0"><path d="M19.3 8.3c-.6-2.6-3-4.5-5.8-4.5-1.9 0-3.6.9-4.7 2.3-.6-.3-1.4-.4-2.1-.4-2.8 0-5.1 2.3-5.1 5.1 0 .4.1.9.2 1.3-1.1.9-1.8 2.2-1.8 3.7 0 2.6 2.1 4.7 4.7h14.3c2.4 0 4.3-1.9 4.3-4.3 0-2.2-1.6-4-3.7-4.3-.1-1.5-.9-2.9-2.3-3.6z"/></svg>`,
  "oracle": `<svg viewBox="0 0 24 24" fill="#F80000"><path d="M16.5 4h-9C3.36 4 0 7.36 0 11.5S3.36 19 7.5 19h9c4.14 0 7.5-3.36 7.5-7.5S20.64 4 16.5 4zm-.3 11.4h-8.4c-2.15 0-3.9-1.75-3.9-3.9s1.75-3.9 3.9-3.9h8.4c2.15 0 3.9 1.75 3.9 3.9s-1.75 3.9-3.9 3.9z"/></svg>`,
  "adobe": `<svg viewBox="0 0 24 24" fill="#FF0000"><path d="M13.96 2H24v20zM0 2h10.04v20zM9.54 11.97l2.87 6.78H9.86l-1.07-2.73H5.97l2.25-5.42 1.32 1.37z"/></svg>`,
  "cisco": `<svg viewBox="0 0 24 24" fill="#1BA0D7"><path d="M4 14h2v6H4zm4-3h2v9H8zm4-3h2v12h-2zm4 3h2v9h-2zm4 3h2v6h-2z"/></svg>`,
  "atlassian": `<svg viewBox="0 0 24 24" fill="#0052CC"><path d="M11.53 2c0 2.4-1.2 4.5-3 5.7L3.4 12.3c-.5.4-.5 1.1 0 1.5l5.13 4.6c1.8 1.2 3 3.3 3 5.7v.9h1.94v-.9c0-2.4 1.2-4.5 3-5.7l5.13-4.6c.5-.4.5-1.1 0-1.5l-5.13-4.6c-1.8-1.2-3-3.3-3-5.7V2h-1.94z"/></svg>`,
  "spotify": `<svg viewBox="0 0 24 24" fill="#1DB954"><path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm4.586 14.424c-.18.295-.563.387-.857.207-2.35-1.435-5.308-1.76-8.792-.963-.335.077-.67-.133-.746-.468-.077-.334.132-.67.467-.745 3.808-.87 7.076-.496 9.72 1.112.295.18.388.563.208.857zm1.226-2.723c-.226.367-.706.482-1.072.257-2.687-1.652-6.785-2.131-9.965-1.166-.413.127-.848-.106-.973-.517-.125-.413.108-.848.52-.973 3.632-1.102 8.147-.568 11.233 1.328.366.226.48.707.257 1.071zm.105-2.835C14.692 8.95 9.375 8.775 6.297 9.71c-.493.15-1.016-.13-1.165-.624-.15-.493.13-1.016.624-1.165 3.532-1.072 9.404-.866 13.115 1.338.445.264.59.838.327 1.282-.264.443-.838.59-1.281.325z"/></svg>`,
  "linkedin": `<svg viewBox="0 0 24 24" fill="#0A66C2"><path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14m-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.28 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 0 1 1.4 1.4v4.93h2.75M6.88 8.56a1.68 1.68 0 0 0 1.68-1.68c0-.93-.75-1.69-1.68-1.69a1.69 1.69 0 0 0-1.69 1.69c0 .93.76 1.68 1.69 1.68m1.39 9.94v-8.37H5.5v8.37h2.77z"/></svg>`,
  "twitter": `<svg viewBox="0 0 24 24" fill="#1DA1F2"><path d="M23 3a10.9 10.9 0 0 1-3.14 1.53 4.48 4.48 0 0 0-7.86 3v1A10.66 10.66 0 0 1 3 4s-4 9 5 13a11.64 11.64 0 0 1-7 2c9 5 20 0 20-11.5a4.5 4.5 0 0 0-.08-.83A7.72 7.72 0 0 0 23 3z"/></svg>`,
  "x": `<svg viewBox="0 0 24 24" fill="#E5E7EB"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>`,
  "nvidia": `<svg viewBox="0 0 24 24" fill="#76B900"><path d="M8.93 7.82c-.44.22-.88.47-1.3.73C5.9 9.6 4.6 11.3 4.6 13.3c0 3.3 2.7 6 6 6 2 0 3.7-1 4.7-2.6.3-.4.5-.9.7-1.3H10.6v-2.3h9.2c.1.6.2 1.3.2 2 0 4.6-3.7 8.3-8.3 8.3-4.6 0-8.3-3.7-8.3-8.3 0-2.8 1.4-5.3 3.5-6.8.6-.4 1.2-.8 1.8-1.1z"/></svg>`,
  "intel": `<svg viewBox="0 0 24 24" fill="#0071C5"><path d="M13.6 17.8h-1.9v-6.7h1.9v6.7zm-.9-7.9c-.7 0-1.2-.5-1.2-1.2s.5-1.2 1.2-1.2 1.2.5 1.2 1.2-.5 1.2-1.2 1.2zM21.2 12c0 5.1-4.1 9.2-9.2 9.2S2.8 17.1 2.8 12 6.9 2.8 12 2.8s9.2 4.1 9.2 9.2z"/></svg>`,
  "openai": `<svg viewBox="0 0 24 24" fill="#10A37F"><path d="M22.28 9.92a5.52 5.52 0 0 0-.49-4.71 5.67 5.67 0 0 0-4.63-2.76 5.61 5.61 0 0 0-3.95 1.34 5.56 5.56 0 0 0-5.78.33 5.68 5.68 0 0 0-2.58 4.29 5.57 5.57 0 0 0-2.12 3.2 5.66 5.66 0 0 0 .74 4.88 5.54 5.54 0 0 0 .49 4.71 5.67 5.67 0 0 0 4.63 2.76 5.61 5.61 0 0 0 3.95-1.34 5.56 5.56 0 0 0 5.78-.33 5.68 5.68 0 0 0 2.58-4.29 5.57 5.57 0 0 0 2.12-3.2 5.66 5.66 0 0 0-.74-4.88z"/></svg>`,
  "anthropic": `<svg viewBox="0 0 24 24" fill="#D97706"><path d="M14.2 3.5h-4.4L3 20.5h4.6l1.7-4.4h5.4l1.7 4.4H21L14.2 3.5zm-3.6 9.4l1.8-4.8 1.8 4.8h-3.6z"/></svg>`
}

function getInitials(name) {
  const words = name.replace(/[^a-zA-Z0-9 ]/g, " ").trim().split(/\s+/)
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return (words[0][0] + words[1][0]).toUpperCase()
}

function getLogo(name) {
  const n = name.toLowerCase()
  for (const [key, svg] of Object.entries(LOGO_SVGS)) {
    if (n === key || n.includes(key)) return svg
  }

  const initials = getInitials(name)
  let brand = BRAND_COLORS.default
  for (const [k, b] of Object.entries(BRAND_COLORS)) {
    if (n.includes(k)) {
      brand = b
      break
    }
  }

  return `<svg viewBox="0 0 24 24"><rect width="24" height="24" rx="5" fill="${brand.bg}" stroke="${brand.border}" stroke-width="1.5"/><text x="12" y="15.5" font-size="9.5" font-family="system-ui, -apple-system, sans-serif" font-weight="800" fill="${brand.text}" text-anchor="middle" letter-spacing="-0.5">${initials}</text></svg>`
}

function getDomain(name) {
  const n = name.toLowerCase().trim()
  for (const [key, d] of Object.entries(DOMAIN_MAP)) {
    if (n === key || n.includes(key)) return d
  }
  const clean = n.replace(/[^a-z0-9]/g, "")
  return `${clean}.com`
}

function processCompany(dirName) {
  const companyDir = path.join(BASE_DIR, dirName)
  if (!fs.existsSync(companyDir) || !fs.statSync(companyDir).isDirectory()) return null

  const companySlug = dirName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
  const category = categorizeCompany(dirName)
  const logoSvg = getLogo(dirName)
  const domain = getDomain(dirName)

  const files = [
    { file: "1. Thirty Days.csv", window: "30d", label: "30 Days", tier: "VERY_HIGH" },
    { file: "2. Three Months.csv", window: "3m", label: "3 Months", tier: "VERY_HIGH" },
    { file: "3. Six Months.csv", window: "6m", label: "6 Months", tier: "HIGH" },
    { file: "4. More Than Six Months.csv", window: "1y", label: "> 6 Months", tier: "MEDIUM" },
    { file: "5. All.csv", window: "all", label: "All Time", tier: "MEDIUM" }
  ]

  const problemMap = new Map()

  for (const { file, window, label, tier } of files) {
    const filePath = path.join(companyDir, file)
    if (!fs.existsSync(filePath)) continue

    const content = fs.readFileSync(filePath, "utf-8")
    const lines = content.split(/\r?\n/).filter(l => l.trim().length > 0)
    if (lines.length <= 1) continue

    for (let i = 1; i < lines.length; i++) {
      const parts = parseCsvLine(lines[i])
      if (parts.length < 5) continue

      const diffRaw = parts[0]?.toUpperCase() || "MEDIUM"
      const diff = diffRaw.includes("EASY") ? "Easy" : diffRaw.includes("HARD") ? "Hard" : "Medium"
      const title = parts[1] || ""
      const freq = parseFloat(parts[2]) || 50.0
      const acc = parts[3] || ""
      const link = parts[4] || ""
      const topicStr = parts[5] || "Algorithms"
      const primaryTopic = topicStr.split(",")[0].trim() || "Algorithms"
      const slug = extractSlug(link)

      if (!slug || !title) continue

      if (problemMap.has(slug)) {
        const existing = problemMap.get(slug)
        if (!existing.windows.includes(window)) {
          existing.windows.push(window)
        }
        if (freq > existing.frequencyScore) {
          existing.frequencyScore = freq
          existing.frequencyTier = freq >= 75 ? "VERY_HIGH" : freq >= 50 ? "HIGH" : freq >= 30 ? "MEDIUM" : "LOW"
        }
      } else {
        problemMap.set(slug, {
          companyId: companySlug,
          companyName: dirName,
          problemId: 0,
          title,
          slug,
          difficulty: diff,
          frequencyScore: freq,
          frequencyTier: freq >= 75 ? "VERY_HIGH" : freq >= 50 ? "HIGH" : freq >= 30 ? "MEDIUM" : "LOW",
          timeframe: window,
          timeframeLabel: label,
          windows: [window],
          topic: primaryTopic,
          acceptanceRate: acc,
          source: "LEETCODE",
          sourceUpdatedAt: "June 2025"
        })
      }
    }
  }

  for (const prob of problemMap.values()) {
    if (prob.windows.includes("30d")) {
      prob.timeframe = "30d"
      prob.timeframeLabel = "30 Days"
    } else if (prob.windows.includes("3m")) {
      prob.timeframe = "3m"
      prob.timeframeLabel = "3 Months"
    } else if (prob.windows.includes("6m")) {
      prob.timeframe = "6m"
      prob.timeframeLabel = "6 Months"
    } else if (prob.windows.includes("1y")) {
      prob.timeframe = "1y"
      prob.timeframeLabel = "> 6 Months"
    } else {
      prob.timeframe = "all"
      prob.timeframeLabel = "All Time"
    }
  }

  const problems = Array.from(problemMap.values()).sort((a, b) => b.frequencyScore - a.frequencyScore)
  if (problems.length === 0) return null

  const topicCounts = new Map()
  for (const p of problems) {
    topicCounts.set(p.topic, (topicCounts.get(p.topic) || 0) + 1)
  }
  const mostFrequentTopics = Array.from(topicCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(e => e[0])

  return {
    id: companySlug,
    name: dirName,
    slug: companySlug,
    category,
    accentColor: "#dfa054",
    domain,
    logoSvg,
    totalProblems: problems.length,
    mostFrequentTopics,
    source: "LEETCODE",
    sourceUpdatedAt: "June 2025",
    problems
  }
}

const entries = fs.readdirSync(BASE_DIR)
const allCompanies = []

for (const entry of entries) {
  const comp = processCompany(entry)
  if (comp && comp.totalProblems > 0) {
    allCompanies.push(comp)
  }
}

allCompanies.sort((a, b) => {
  const catRank = { "big-tech": 4, "quant-finance": 3, "unicorns": 2, "enterprise": 1, "other": 0 }
  const rankDiff = (catRank[b.category] || 0) - (catRank[a.category] || 0)
  if (rankDiff !== 0) return rankDiff
  return b.totalProblems - a.totalProblems
})

console.log(`Successfully compiled ${allCompanies.length} companies and ${allCompanies.reduce((acc, c) => acc + c.totalProblems, 0)} total question mappings!`)

// Write JSON
const outDir = path.resolve("./lib")
fs.writeFileSync(path.join(outDir, "companies-dataset.json"), JSON.stringify(allCompanies))

// Generate TypeScript Engine code with full dataset embedded
const tsCode = `// ─── ALGOVAULT COMPANY INTERVIEW PRACTICE ENGINE (REAL LEETCODE DATA) ────────
// Real, authentic dataset compiled from 440+ tech & finance companies.
// Dataset provenance: LeetCode Verified Interview Questions (Updated: June 2025).

import rawCompaniesJson from "./companies-dataset.json"

export type CompanyCategory = "big-tech" | "quant-finance" | "unicorns" | "enterprise" | "other"
export type FrequencyTier = "VERY_HIGH" | "HIGH" | "MEDIUM" | "LOW"
export type TimeWindow = "30d" | "3m" | "6m" | "1y" | "all"

export interface CompanyProblemEvidence {
  companyId: string
  companyName: string
  problemId: number
  title: string
  slug: string
  difficulty: "Easy" | "Medium" | "Hard"
  frequencyScore: number
  frequencyTier: FrequencyTier
  timeframe: TimeWindow
  timeframeLabel: string
  windows: TimeWindow[]
  topic: string
  acceptanceRate?: string
  source: "LEETCODE"
  sourceUpdatedAt: string
}

export interface CompanySummary {
  id: string
  name: string
  slug: string
  category: CompanyCategory
  accentColor: string
  domain?: string
  logoSvg: string
  totalProblems: number
  mostFrequentTopics: string[]
  source: "LEETCODE"
  sourceUpdatedAt: string
  problems: CompanyProblemEvidence[]
}

export interface DifficultyStats {
  sampleSize: number
  median: number | null
  mean: number | null
  p25: number | null
  p75: number | null
  min: number | null
  max: number | null
  insufficientData: boolean
  ratingBands: {
    under1600: number
    band1600_1800: number
    band1800_2000: number
    band2000_2200: number
    above2200: number
  }
}

// ─── UNIFIED STATISTICAL FUNCTIONS (Linear Interpolation) ──────────────────

export function calculatePercentile(sortedValues: number[], p: number): number | null {
  if (!sortedValues || sortedValues.length === 0) return null
  if (sortedValues.length === 1) return sortedValues[0]
  if (p <= 0) return sortedValues[0]
  if (p >= 1) return sortedValues[sortedValues.length - 1]

  const index = (sortedValues.length - 1) * p
  const lower = Math.floor(index)
  const fraction = index - lower

  if (lower + 1 < sortedValues.length) {
    return Math.round(sortedValues[lower] + fraction * (sortedValues[lower + 1] - sortedValues[lower]))
  }
  return sortedValues[lower]
}

export function calculateWindowDifficultyStats(
  problems: CompanyProblemEvidence[],
  zerotracRatingMap: Map<string, number>,
  timeframe?: "30d" | "3m" | "6m" | "1y" | "all"
): DifficultyStats {
  const filtered = timeframe && timeframe !== "all"
    ? problems.filter((p) => p.windows && p.windows.includes(timeframe))
    : problems

  const validRatings: number[] = []
  const bands = {
    under1600: 0,
    band1600_1800: 0,
    band1800_2000: 0,
    band2000_2200: 0,
    above2200: 0
  }

  for (const prob of filtered) {
    const rating = zerotracRatingMap.get(prob.slug.toLowerCase())
    if (typeof rating === "number" && Number.isFinite(rating) && rating > 0) {
      validRatings.push(rating)
      if (rating < 1600) bands.under1600++
      else if (rating < 1800) bands.band1600_1800++
      else if (rating < 2000) bands.band1800_2000++
      else if (rating < 2200) bands.band2000_2200++
      else bands.above2200++
    }
  }

  const sampleSize = validRatings.length
  if (sampleSize === 0) {
    return {
      sampleSize: 0,
      median: null,
      mean: null,
      p25: null,
      p75: null,
      min: null,
      max: null,
      insufficientData: true,
      ratingBands: bands
    }
  }

  validRatings.sort((a, b) => a - b)

  const sum = validRatings.reduce((acc, r) => acc + r, 0)
  const mean = Math.round(sum / sampleSize)
  const median = calculatePercentile(validRatings, 0.5)
  const p25 = calculatePercentile(validRatings, 0.25)
  const p75 = calculatePercentile(validRatings, 0.75)
  const min = validRatings[0]
  const max = validRatings[validRatings.length - 1]

  return {
    sampleSize,
    median,
    mean,
    p25,
    p75,
    min,
    max,
    insufficientData: sampleSize < 3,
    ratingBands: bands
  }
}

// ─── MASTER COMPANY DIRECTORY ───────────────────────────────────────────────

export const COMPANIES_DATA: CompanySummary[] = (rawCompaniesJson as any) as CompanySummary[]

// ─── HIGH-SPEED INVERTED SLUG INDEX (O(1) IN-PAGE LEETCODE LOOKUP) ─────────

export const PROBLEM_SLUG_TO_COMPANIES = new Map<string, CompanyProblemEvidence[]>()

for (const company of COMPANIES_DATA) {
  for (const prob of company.problems) {
    const slugKey = prob.slug.toLowerCase()
    const existing = PROBLEM_SLUG_TO_COMPANIES.get(slugKey) || []
    existing.push(prob)
    PROBLEM_SLUG_TO_COMPANIES.set(slugKey, existing)
  }
}
`

fs.writeFileSync(path.join(outDir, "company-data.ts"), tsCode)
console.log("Wrote updated company-data.ts to", path.join(outDir, "company-data.ts"))
