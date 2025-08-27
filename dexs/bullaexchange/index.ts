import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

const BULLA_API_URL = "https://api.gamma.xyz/frontend/externalApis/bulla/pools";

interface BullaPool {
  calculated24h: {
    volumeUSD: number;
    feesUSD: number;
  };
}

interface BullaResponse {
  data: {
    pools: BullaPool[];
  };
}

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances(); // No holder revenue for now

  const response: BullaResponse = await fetchURL(BULLA_API_URL);

  const totalDailyFees = response.data.pools.reduce((acc, pool) => {
    return acc + (pool.calculated24h?.feesUSD || 0);
  }, 0);

  const protocolRevenue = totalDailyFees * 0.25;
  const supplySideRevenue = totalDailyFees * 0.75;

  // Add fees to balances (in USD)
  dailyFees.addUSDValue(totalDailyFees);
  dailyProtocolRevenue.addUSDValue(protocolRevenue);
  dailySupplySideRevenue.addUSDValue(supplySideRevenue);
  const dailyVolume = options.createBalances();
  dailyVolume.addUSDValue(
    response.data.pools.reduce((acc, pool) => {
      return acc + (pool.calculated24h?.volumeUSD || 0);
    }, 0)
  );
  return {
    dailyFees,
    dailyVolume,
    dailyRevenue: dailyProtocolRevenue,
    dailyUserFees: dailyFees, // User fees are the same as total fees
    dailyProtocolRevenue,
    dailySupplySideRevenue,
    dailyHoldersRevenue,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.BERACHAIN]: {
      fetch,
      runAtCurrTime: true,
    },
  },
  methodology: {
    Fees: "Trading fees collected by Bulla exchange",
    UserFees: "Trading fees paid by users",
    Revenue:
      "Protocol revenue from trading fees (25% of total fees, per fee switch)",
    ProtocolRevenue:
      "Revenue retained by the protocol (25% of fees, per fee switch)",
    SupplySideRevenue:
      "Revenue shared with liquidity providers (75% of total fees, per fee switch)",
  },
};

export default adapter;
