import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";

const HYPERCAT_API_URL = "https://api.gamma.xyz/frontend/externalApis/hypercat/pools";

interface HypercatToken {
  id: string;
  symbol: string;
  name: string;
  decimals: string;
  derivedMatic: string;
  totalValueLocked: string;
  totalValueLockedUSD: string;
}

interface HypercatPool {
  id: string;
  fee: string;
  token0: HypercatToken;
  token1: HypercatToken;
  sqrtPrice: string;
  liquidity: string;
  tick: string;
  tickSpacing: string;
  totalValueLockedUSD: string;
  totalValueLockedToken0: string;
  totalValueLockedToken1: string;
  volumeUSD: string;
  feesUSD: string;
  untrackedFeesUSD: string;
  token0Price: string;
  token1Price: string;
  communityFee: string;
  calculated24h: {
    volumeUSD: number;
    feesUSD: number;
    averageTVL: number;
  };
}

interface HypercatResponse {
  data: {
    pools: HypercatPool[];
  };
}

const fetch = async (timestamp: number) => {
  try {
    // Fetch data from the official Hypercat API
    const response: HypercatResponse = await httpGet(HYPERCAT_API_URL);
    
    if (!response?.data?.pools) {
      console.warn("No pools data received from Hypercat API");
      return {
        dailyVolume: "0",
        dailyFees: "0",
        dailyRevenue: "0",
        dailyProtocolRevenue: "0",
        dailySupplySideRevenue: "0",
        timestamp: Math.floor(timestamp / 86400) * 86400,
      };
    }

    const dayTimestamp = Math.floor(timestamp / 86400) * 86400;
    
    // Calculate total daily volume from all pools using calculated24h data
    const dailyVolume = response.data.pools.reduce((acc, pool) => {
      return acc + (pool.calculated24h?.volumeUSD || 0);
    }, 0);

    // Calculate total daily fees from all pools using calculated24h data
    const dailyFees = response.data.pools.reduce((acc, pool) => {
      return acc + (pool.calculated24h?.feesUSD || 0);
    }, 0);

    // Protocol revenue is 25% of total fees
    const dailyProtocolRevenue = dailyFees * 0.25;
    // Supply side revenue is 75% of total fees
    const dailySupplySideRevenue = dailyFees * 0.75;

    // Calculate daily revenue (for DEX dashboard, this is usually protocol revenue)
    const dailyRevenue = dailyProtocolRevenue;

    console.log(`Hypercat DEX - Daily Volume: $${dailyVolume.toFixed(2)}, Daily Fees: $${dailyFees.toFixed(2)}`);

    return {
      dailyVolume: dailyVolume.toString(),
      dailyFees: dailyFees.toString(),
      dailyRevenue: dailyRevenue.toString(),
      dailyProtocolRevenue: dailyProtocolRevenue.toString(),
      dailySupplySideRevenue: dailySupplySideRevenue.toString(),
      timestamp: dayTimestamp,
    };
  } catch (error) {
    console.error("Error fetching Hypercat DEX data:", error);
    return {
      dailyVolume: "0",
      dailyFees: "0", 
      dailyRevenue: "0",
      dailyProtocolRevenue: "0",
      dailySupplySideRevenue: "0",
      timestamp: Math.floor(timestamp / 86400) * 86400,
    };
  }
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.HYPERLIQUID]: {
      fetch,
      start: async () => 1704067200, // January 1, 2024 - adjust based on Hypercat's actual launch date
      meta: {
        methodology: {
          Fees: "Trading fees collected by Hypercat exchange, sourced from official Hypercat API using calculated24h feesUSD",
          Revenue: "Protocol revenue from trading fees (25% of total fees, per fee switch)",
          UserFees: "Trading fees paid by users (same as total fees)",
          SupplySideRevenue: "Revenue shared with liquidity providers (75% of total fees, per fee switch)",
          ProtocolRevenue: "Revenue retained by the protocol (25% of fees, per fee switch)",
          HoldersRevenue: "Revenue distributed to token holders (currently 0)",
        },
        hallmarks: [
          // Add significant events that affected Hypercat's data
          // Example: [1704067200, "Hypercat launch on Hyperliquid"]
        ],
      },
    },
  },
};

export default adapter;
