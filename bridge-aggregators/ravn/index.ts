import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";

// RAVN (https://ravn.exchange) - cross-chain execution layer for native Bitcoin, EVM and Solana. RAVN routes each
// swap through the venue that quotes best (Relay, OKX, 0x, KyberSwap, Jupiter, Mayan, Across, CoW, ...) and has no
// router contract: swaps execute on the venues' own contracts, so no single on-chain event covers RAVN's volume.
//
// Volume is read from RAVN's own swap record, the public list https://app.ravn.exchange/transactions shows:
// https://app.ravn.exchange/api/defillama returns, for any window, completed cross-chain swap volume in USD by sending chain, and
// every swap counted with its transaction or order link, so each figure can be checked on-chain. Only swaps with
// such a link and a dollar value verified against a native coin, BTC or a stablecoin are counted (swaps paid into a
// venue's deposit address, e.g. from Bitcoin, have no per-swap link and are left out). The venues RAVN routes
// through are tracked by DefiLlama, and HyperDex's adapters count its RAVN-routed swaps, so this is double counted.

const RAVN_API = "https://app.ravn.exchange/api/defillama";

// chainId: the chain's id in RAVN's record (Bitcoin -1, Solana -2)
const chainConfig: Record<string, { chainId: number; start: string }> = {
  [CHAIN.ROBINHOOD]: { chainId: 4663, start: "2026-10-11" },
  [CHAIN.ARBITRUM]: { chainId: 42161, start: "2026-10-11" },
  [CHAIN.ETHEREUM]: { chainId: 1, start: "2026-10-13" },
  [CHAIN.BSC]: { chainId: 56, start: "2026-10-14" },
  [CHAIN.BASE]: { chainId: 8453, start: "2026-10-14" },
  [CHAIN.SOLANA]: { chainId: -2, start: "2026-10-15" },
  [CHAIN.HYPERLIQUID]: { chainId: 999, start: "2026-10-18" },
  [CHAIN.POLYGON]: { chainId: 137, start: "2026-10-20" },
  [CHAIN.AVAX]: { chainId: 43114, start: "2026-10-28" },
  [CHAIN.MONAD]: { chainId: 143, start: "2026-11-02" },
  [CHAIN.OPTIMISM]: { chainId: 10, start: "2026-11-09" },
  [CHAIN.ELYSIUM]: { chainId: 99901, start: "2026-11-09" },
  [CHAIN.INK]: { chainId: 57073, start: "2026-11-20" },
}

// One request per window for every chain. Non-200 (database down, window not closed yet) throws, so a
// short window is never stored
const prefetch = async (options: FetchOptions) => {
  const record = await httpGet(`${RAVN_API}?start=${options.startTimestamp}&end=${options.endTimestamp}`)
  if (record?.start !== options.startTimestamp || record?.end !== options.endTimestamp) throw new Error("RAVN: unexpected window")
  return record
}

const fetch = async (options: FetchOptions) => {
  const { chainId } = chainConfig[options.chain]
  const record = options.preFetchedResults
  if (!record?.swaps || !record?.bridges || typeof record.swaps !== "object" || typeof record.bridges !== "object") throw new Error("RAVN: malformed response")
  const dailyBridgeVolume = options.createBalances()
  dailyBridgeVolume.addUSDValue(Number(record.bridges?.[chainId] ?? 0))
  return { dailyBridgeVolume }
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  prefetch,
  adapter: chainConfig,
  doublecounted: true,
  methodology: {
    BridgeVolume: "Completed cross-chain swap volume in USD by sending chain from RAVN's public swap record (https://app.ravn.exchange/api/defillama), each swap with its transaction link. Counted only when the swap has a public tx or order link and a dollar value verified against a native coin, BTC or a stablecoin in the swap; each swap is valued in USD at its input, or at its output when only the output is priced, and dated by settlement.",
  },
}

export default adapter
