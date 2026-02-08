import fetchURL from "../../utils/fetchURL";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const STATS_URL = "https://api.fwog.fun/stats";

interface TokenAmount {
  sol: number;
  usd: number;
}

interface StatsBlock {
  total: TokenAmount;
  regular: TokenAmount;
  fwogtok: TokenAmount;
  fwogcasts: TokenAmount;
  legacy: TokenAmount;
  x: TokenAmount;
}

interface StatsResponse {
  allTime: {
    fees: StatsBlock;
    revenue: StatsBlock;
    volume: StatsBlock;
  };
  daily: {
    fees: StatsBlock;
    revenue: StatsBlock;
    volume: StatsBlock;
  };
}

const CATEGORIES = ["regular", "fwogtok", "fwogcasts", "legacy", "x"] as const;

function addByCategory(
  balances: ReturnType<FetchOptions["createBalances"]>,
  data: StatsBlock | undefined,
  labelPrefix: string
) {
  if (!data) return;
  for (const cat of CATEGORIES) {
    const val = data[cat]?.sol;
    if (val != null && val > 0) {
      const label = labelPrefix + cat.charAt(0).toUpperCase() + cat.slice(1);
      balances.addCGToken("solana", val, label);
    }
  }
}

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const totalVolume = options.createBalances();
  const totalFees = options.createBalances();
  const totalRevenue = options.createBalances();
  const res: StatsResponse = await fetchURL(STATS_URL);

  // Daily: last 24h (only when API returns allTime + daily)
  addByCategory(dailyVolume, res.daily?.volume, "Volume ");
  addByCategory(dailyFees, res.daily?.fees, "Fees ");
  addByCategory(dailyRevenue, res.daily?.revenue, "Revenue ");

  // All-time stats
  addByCategory(totalVolume, res.allTime?.volume, "Volume ");
  addByCategory(totalFees, res.allTime?.fees, "Fees ");
  addByCategory(totalRevenue, res.allTime?.revenue, "Revenue ");

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue,
    totalVolume,
    totalFees,
    totalRevenue,
  };
};

const methodology = {
  Fees: "Trading fees collected from all swaps on the platform.",
  Revenue: "Creator revenue for X coins and fwogtok.",
  Volume:
    "Trading volume from api.fwog.fun",
};

const breakdownMethodology = {
  Fees: {
    "Fees Regular": "Protocol fees from regular/legacy tokens.",
    "Fees Fwogtok": "Protocol fees from Fwogtok tokens.",
    "Fees Fwogcasts": "Protocol fees from Fwogcasts.",
    "Fees Legacy": "Protocol fees from legacy tokens.",
    "Fees X": "Protocol fees from Twitter/X tokens.",
  },
  Revenue: {
    "Revenue Regular": "Creator revenue from regular tokens.",
    "Revenue Fwogtok": "Creator revenue from Fwogtok tokens.",
    "Revenue Fwogcasts": "Creator revenue from Fwogcasts.",
    "Revenue Legacy": "Creator revenue from legacy tokens.",
    "Revenue X": "Creator revenue from Twitter/X tokens.",
  },
  Volume: {
    "Volume Regular": "Trading volume from regular/legacy tokens.",
    "Volume Fwogtok": "Trading volume from Fwogtok tokens.",
    "Volume Fwogcasts": "Trading volume from Fwogcasts (always 0).",
    "Volume Legacy": "Trading volume from legacy tokens.",
    "Volume X": "Trading volume from Twitter/X tokens.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  runAtCurrTime: true,
  chains: [CHAIN.SOLANA],
  start: "2025-01-01",
  methodology,
  breakdownMethodology,
};

export default adapter;
