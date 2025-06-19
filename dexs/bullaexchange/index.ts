import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";

const BULLA_API_URL = "https://api.gamma.xyz/frontend/externalApis/bulla/pools";

interface BullaToken {
  id: string;
  symbol: string;
  name: string;
  decimals: string;
  derivedMatic: string;
  totalValueLocked: string;
  totalValueLockedUSD: string;
}

interface BullaPool {
  id: string;
  fee: string;
  token0: BullaToken;
  token1: BullaToken;
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

interface BullaResponse {
  data: {
    pools: BullaPool[];
  };
}

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  
  try {
    // Fetch data from the official Bulla API
    const response: BullaResponse = await httpGet(BULLA_API_URL);
    
    if (!response?.data?.pools) {
      console.warn("No pools data received from Bulla API");
      return {
        dailyFees,
        dailyRevenue,
        dailyUserFees: dailyFees,
        dailyProtocolRevenue,
        dailySupplySideRevenue,
        dailyHoldersRevenue: options.createBalances(),
      };
    }

    // Calculate total daily fees from all pools using calculated24h data
    const totalDailyFees = response.data.pools.reduce((acc, pool) => {
      return acc + (pool.calculated24h?.feesUSD || 0);
    }, 0);

    // Calculate total daily volume using calculated24h data
    const totalDailyVolume = response.data.pools.reduce((acc, pool) => {
      return acc + (pool.calculated24h?.volumeUSD || 0);
    }, 0);

    // Protocol revenue is 25% of total fees
    const protocolRevenue = totalDailyFees * 0.25;
    // Supply side revenue is 75% of total fees
    const supplySideRevenue = totalDailyFees * 0.75;

    // Add fees to balances (in USD)
    dailyFees.addUSDValue(totalDailyFees);
    dailyRevenue.addUSDValue(protocolRevenue); // For DeFiLlama, dailyRevenue = protocol revenue
    dailyProtocolRevenue.addUSDValue(protocolRevenue);
    dailySupplySideRevenue.addUSDValue(supplySideRevenue);

    return {
      dailyFees,
      dailyRevenue,
      dailyUserFees: dailyFees, // User fees are the same as total fees
      dailyProtocolRevenue,
      dailySupplySideRevenue,
      dailyHoldersRevenue: options.createBalances(), // No holder revenue for now
    };
  } catch (error) {
    console.error("Error fetching Bulla fees data:", error);
    return {
      dailyFees,
      dailyRevenue,
      dailyUserFees: dailyFees,
      dailyProtocolRevenue,
      dailySupplySideRevenue,
      dailyHoldersRevenue: options.createBalances(),
    };
  }
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.BERACHAIN]: {
      fetch,
      runAtCurrTime: true,
      meta: {
        methodology: {
          Fees: "Trading fees collected by Bulla exchange, sourced from official Bulla API using calculated24h feesUSD",
          Revenue: "Protocol revenue from trading fees (25% of total fees, per fee switch)",
          UserFees: "Trading fees paid by users (same as total fees)",
          SupplySideRevenue: "Revenue shared with liquidity providers (75% of total fees, per fee switch)",
          ProtocolRevenue: "Revenue retained by the protocol (25% of fees, per fee switch)",
          HoldersRevenue: "Revenue distributed to token holders (currently 0)",
        },
      },
    },
  },
};

export default adapter; 