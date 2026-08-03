import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { httpGet } from "../../utils/fetchURL";
import { CHAIN } from "../../helpers/chains";

// Public LeoDex swap explorer API (also powers https://leodex.io/explorer)
const API = "https://api.leokit.dev/explorer/transactions";
const PAGE_LIMIT = 100;
const MAX_PAGES = 300;

const VOLUME_LABEL = "Cross-chain Swaps";

// LeoDex asset ids are "<CHAIN>.<SYMBOL>[-<address>]"; volume is attributed to the source chain
const PREFIX_TO_CHAIN: Record<string, string> = {
  ARB: CHAIN.ARBITRUM,
  AVAX: CHAIN.AVAX,
  BASE: CHAIN.BASE,
  BCH: CHAIN.BITCOIN_CASH,
  BSC: CHAIN.BSC,
  BTC: CHAIN.BITCOIN,
  DASH: CHAIN.DASH,
  DOGE: CHAIN.DOGE,
  ETH: CHAIN.ETHEREUM,
  GAIA: CHAIN.COSMOS,
  KUJI: CHAIN.KUJIRA,
  LTC: CHAIN.LITECOIN,
  MAYA: CHAIN.MAYA,
  NEAR: CHAIN.NEAR,
  OP: CHAIN.OPTIMISM,
  POLYGON: CHAIN.POLYGON,
  SOL: CHAIN.SOLANA,
  THOR: CHAIN.THORCHAIN,
  TON: CHAIN.TON,
  TRON: CHAIN.TRON,
  XMR: CHAIN.MONERO,
  XRP: CHAIN.RIPPLE,
  ZEC: CHAIN.ZEC,
};

interface ExplorerTransaction {
  created_at: string;
  from_asset: string;
  volume_usd: number | null;
}

interface ExplorerResponse {
  data: ExplorerTransaction[];
  next_cursor: string | null;
  has_more: boolean;
}

// One paging pass per time window, shared across the per-chain fetch calls
const windowCache: Record<string, Promise<Record<string, number>>> = {};

function fetchWindowVolumeByChain(options: FetchOptions): Promise<Record<string, number>> {
  const key = `${options.fromTimestamp}-${options.toTimestamp}`;
  if (!windowCache[key]) {
    windowCache[key] = (async () => {
      const startMs = options.fromTimestamp * 1000;
      const endMs = (options.toTimestamp + 1) * 1000;
      const sums: Record<string, number> = {};
      // Cursor pages newest-first with swap_date < cursor, so start at the end of the window
      let cursor = new Date(endMs).toISOString();
      for (let page = 0; page < MAX_PAGES; page++) {
        const res: ExplorerResponse = await httpGet(
          `${API}?limit=${PAGE_LIMIT}&cursor=${encodeURIComponent(cursor)}`
        );
        const rows = res.data ?? [];
        for (const row of rows) {
          if (new Date(row.created_at).getTime() < startMs) return sums;
          const prefix = row.from_asset.split(".")[0].split("-")[0].toUpperCase();
          const chain = PREFIX_TO_CHAIN[prefix];
          if (!chain) continue; // non-chain-prefixed asset ids, excluded from the breakdown
          sums[chain] = (sums[chain] || 0) + (row.volume_usd || 0);
        }
        if (!res.has_more || !res.next_cursor) return sums;
        cursor = res.next_cursor;
      }
      throw new Error(`leodex: exceeded ${MAX_PAGES} pages for ${key}`);
    })().catch((error) => {
      delete windowCache[key];
      throw error;
    });
  }
  return windowCache[key];
}

const fetch = async (options: FetchOptions) => {
  const volumeByChain = await fetchWindowVolumeByChain(options);
  const dailyVolume = options.createBalances();
  dailyVolume.addUSDValue(volumeByChain[options.chain] || 0, VOLUME_LABEL);
  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [...new Set(Object.values(PREFIX_TO_CHAIN))],
  start: "2024-04-01",
  methodology: {
    Volume:
      "Cross-chain swap volume routed through LeoDex across its supported protocols (THORChain, Maya Protocol, Chainflip, NEAR Intents, Relay and others), read from LeoDex's public swap explorer API and attributed to the source chain of each swap.",
  },
  breakdownMethodology: {
    Volume: {
      [VOLUME_LABEL]:
        "USD value of each swap routed through LeoDex, counted once on the source chain of the swap.",
    },
  },
};

export default adapter;
