import fetchURL from "../../utils/fetchURL";
import { FetchOptions, FetchV2, SimpleAdapter } from "../../adapters/types";
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
      balances.addCGToken("solana", val);
    }
  }
}

const fetch: FetchV2 = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  
  const totalVolume = options.createBalances();
  const totalFees = options.createBalances();
  const totalSupplySideRevenue = options.createBalances();
  const totalRevenue = options.createBalances();
  const totalProtocolRevenue = options.createBalances();
  
  const res: StatsResponse = await fetchURL(STATS_URL);

  // According to API structure:
  // - API "fees" = protocolRevenue (treasury fees, direct from API)
  // - API "revenue" = supplySideRevenue (creator revenue, direct from API)
  // - fees (metric) = protocolRevenue + supplySideRevenue (addition)
  // - revenue (metric) = protocolRevenue (no holdersRevenue)
  
  // API "fees" = protocolRevenue (direct)
  addByCategory(dailyProtocolRevenue, res.daily?.fees, "ProtocolRevenue ");
  addByCategory(totalProtocolRevenue, res.allTime?.fees, "ProtocolRevenue ");
  
  // API "revenue" = supplySideRevenue (direct)
  addByCategory(dailySupplySideRevenue, res.daily?.revenue, "SupplySideRevenue ");
  addByCategory(totalSupplySideRevenue, res.allTime?.revenue, "SupplySideRevenue ");
  
  // Fees = protocolRevenue + supplySideRevenue (addition)
  dailyFees.addBalances(dailyProtocolRevenue);
  dailyFees.addBalances(dailySupplySideRevenue);
  totalFees.addBalances(totalProtocolRevenue);
  totalFees.addBalances(totalSupplySideRevenue);
  
  // Revenue = protocolRevenue (no holdersRevenue)
  dailyRevenue.addBalances(dailyProtocolRevenue);
  totalRevenue.addBalances(totalProtocolRevenue);

  // Volume
  addByCategory(dailyVolume, res.daily?.volume, "Volume ");
  addByCategory(totalVolume, res.allTime?.volume, "Volume ");

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue,
    dailySupplySideRevenue,
    totalVolume,
    totalFees,
    totalRevenue,
    totalProtocolRevenue,
    totalSupplySideRevenue,
  };
};

const methodology = {
  Fees: "Total trading fees collected from all swaps on the platform.",
  Revenue: "Protocol revenue received by the protocol treasury.",
  ProtocolRevenue: "Revenue received by the protocol treasury.",
  SupplySideRevenue: "Revenue received by creators for X coins and fwogtok.",
  Volume: "Trading volume from api.fwog.fun",
};

const breakdownMethodology = {
  Fees: {
    "Fees Regular": "Trading fees from regular/legacy tokens.",
    "Fees Fwogtok": "Trading fees from Fwogtok tokens.",
    "Fees Fwogcasts": "Trading fees from Fwogcasts.",
    "Fees Legacy": "Trading fees from legacy tokens.",
    "Fees X": "Trading fees from Twitter/X tokens.",
  },
  Revenue: {
    "Revenue Regular": "Protocol revenue from regular tokens.",
    "Revenue Fwogtok": "Protocol revenue from Fwogtok tokens.",
    "Revenue Fwogcasts": "Protocol revenue from Fwogcasts.",
    "Revenue Legacy": "Protocol revenue from legacy tokens.",
    "Revenue X": "Protocol revenue from Twitter/X tokens.",
  },
  ProtocolRevenue: {
    "ProtocolRevenue Regular": "Treasury revenue from regular tokens.",
    "ProtocolRevenue Fwogtok": "Treasury revenue from Fwogtok tokens.",
    "ProtocolRevenue Fwogcasts": "Treasury revenue from Fwogcasts.",
    "ProtocolRevenue Legacy": "Treasury revenue from legacy tokens.",
    "ProtocolRevenue X": "Treasury revenue from Twitter/X tokens.",
  },
  SupplySideRevenue: {
    "SupplySideRevenue Regular": "Creator revenue from regular tokens.",
    "SupplySideRevenue Fwogtok": "Creator revenue from Fwogtok tokens.",
    "SupplySideRevenue Fwogcasts": "Creator revenue from Fwogcasts.",
    "SupplySideRevenue Legacy": "Creator revenue from legacy tokens.",
    "SupplySideRevenue X": "Creator revenue from Twitter/X tokens.",
  },
  Volume: {
    "Volume Regular": "Trading volume from regular tokens.",
    "Volume Fwogtok": "Trading volume from Fwogtok tokens.",
    "Volume Fwogcasts": "Trading volume from Fwogcasts.",
    "Volume Legacy": "Trading volume from legacy tokens.",
    "Volume X": "Trading volume from Twitter/X tokens.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  chains: [CHAIN.SOLANA],
  methodology,
  breakdownMethodology,
  adapter: {
    [CHAIN.SOLANA]: {
      fetch,
      runAtCurrTime: true,
      start: "2025-01-01",
    },
  },
};

export default adapter;
