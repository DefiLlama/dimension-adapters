import { CHAIN } from "../helpers/chains"
import { getGraphDimensions2 } from "../helpers/getUniSubgraph"
import type { FetchOptions } from "../adapters/types"

const methodology = {
  Fees: "Sum of swap fees on PotatoSwap v2 pools.",
  UserFees: "Same as Fees.",
  Revenue: "Portion of fees directed to the protocol when enabled on pools.",
  ProtocolRevenue: "Same as Revenue.",
  SupplySideRevenue: "Fees paid to LPs, computed as Fees minus ProtocolRevenue.",
}

const FEES_PERCENT = {
  Fees: 0.25,
  UserFees: 0.25,
  ProtocolRevenue: 0,
  HoldersRevenue: 0.08,
  SupplySideRevenue: 0.17,
  Revenue: 0.08,
} as const

const V2_GRAPH_URLS = [
  "https://indexer.potatoswap.finance/subgraphs/id/Qmaeqine8JeSiKV3QCi6JJqzDGryF7D8HCJdqcYxW7nekw",
]

const graphs = getGraphDimensions2({
  graphUrls: {
    [CHAIN.XLAYER]: V2_GRAPH_URLS,
  },
  totalVolume: {
    factory: "pancakeFactories",
  },
  feesPercent: {
    type: "volume" as const,
    ...FEES_PERCENT,
  },
})

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function safeZeros() {
  return {
    dailyVolume: "0",
    dailyFees: "0",
    dailyUserFees: "0",
    dailyRevenue: "0",
    dailyProtocolRevenue: "0",
    dailySupplySideRevenue: "0",
  }
}

function toNum(v: any): number {
  if (v === null || v === undefined) return 0
  if (typeof v === "number") return Number.isFinite(v) ? v : 0
  if (typeof v === "string") {
    const cleaned = v.replace(/,/g, "").trim()
    const n = Number(cleaned)
    return Number.isFinite(n) ? n : 0
  }
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

async function fetchJson<T>(url: string): Promise<T> {
  const httpFetch = globalThis.fetch as any
  if (typeof httpFetch !== "function") throw new Error("global fetch is not available in this runtime")

  // Create a short-lived dispatcher to avoid hanging handles on Windows when the CLI process.exit()s
  let dispatcher: any = undefined
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { Agent } = require("undici")
    dispatcher = new Agent({
      connections: 1,
      pipelining: 0,
      keepAliveTimeout: 1,
      keepAliveMaxTimeout: 1,
    })
  } catch {
    dispatcher = undefined
  }

  try {
    const res = await httpFetch(url, {
      headers: {
        accept: "application/json",
        "user-agent": "defillama-dimension-adapter/1.0",
      },
      ...(dispatcher ? { dispatcher } : {}),
    })

    if (!res?.ok) {
      const text = await res?.text?.().catch(() => "")
      throw new Error(`HTTP ${res?.status} ${res?.statusText} ${String(text).slice(0, 200)}`)
    }

    return (await res.json()) as T
  } finally {
    // Close dispatcher so Node has no open handles when testAdapter calls process.exit()
    await dispatcher?.close?.().catch(() => {})
  }
}

type PotatoPool = {
  protocol_version?: string
  volume_24h_usd?: string | number
  fee_24h_usd?: string | number
}

type PotatoApiResp = {
  code: number
  msg?: string
  data?: PotatoPool[]
}

async function fetchFromPotatoApiV2Only(): Promise<{
  dailyVolume: string
  dailyFees: string
  dailyUserFees: string
  dailyRevenue: string
  dailyProtocolRevenue: string
  dailySupplySideRevenue: string
}> {
  const url = "https://v3.potatoswap.finance/api/pool/list-all"
  const json = await fetchJson<PotatoApiResp>(url)

  if (!json || json.code !== 200 || !Array.isArray(json.data)) {
    throw new Error(`Unexpected PotatoSwap API response: ${json?.code} ${json?.msg ?? ""}`)
  }

  const pools = json.data.filter((p) => {
    const pv = String(p.protocol_version ?? "").toLowerCase().trim()
    return pv === "v2" || pv === "2"
  })

  let volume24h = 0
  let fees24h = 0
  for (const p of pools) {
    volume24h += toNum(p.volume_24h_usd)
    fees24h += toNum(p.fee_24h_usd)
  }

  const dailyFees = fees24h
  const dailyRevenue = dailyFees * FEES_PERCENT.Revenue
  const dailyProtocolRevenue = dailyRevenue
  const dailySupplySideRevenue = dailyFees - dailyProtocolRevenue

  return {
    dailyVolume: volume24h.toString(),
    dailyFees: dailyFees.toString(),
    dailyUserFees: dailyFees.toString(),
    dailyRevenue: dailyRevenue.toString(),
    dailyProtocolRevenue: dailyProtocolRevenue.toString(),
    dailySupplySideRevenue: dailySupplySideRevenue.toString(),
  }
}

async function fetchWithRetry(timestamp: number, chainBlocks: any, options: FetchOptions, attempts = 3) {
  let lastErr: any
  for (let i = 0; i < attempts; i++) {
    try {
      return await (graphs as any)(timestamp, chainBlocks, options)
    } catch (e) {
      lastErr = e
      await sleep(500 * Math.pow(2, i))
    }
  }
  throw lastErr
}

async function fetchAdapter(timestamp: number, chainBlocks: any, options: FetchOptions) {
  // API first (rolling 24h). Subgraph is currently failing with Cloudflare DNS errors.
  try {
    return await fetchFromPotatoApiV2Only()
  } catch {
    // ignore and fallback
  }

  // Fallback to subgraph (historical), if it ever works again
  try {
    return await fetchWithRetry(timestamp, chainBlocks, options, 3)
  } catch {
    return safeZeros()
  }
}

export default {
  version: 2,
  methodology,
  adapter: {
    [CHAIN.XLAYER]: {
      fetch: fetchAdapter,
      start: "2024-04-23",
      runAtCurrTime: true,
    },
  },
}
