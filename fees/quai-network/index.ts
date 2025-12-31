import { Adapter, FetchOptions, ProtocolType } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

// Quai Network SOAP merged mining revenue dashboard API
const API_BASE = "https://soap.qu.ai";

interface DailyRevenueResponse {
  success: boolean;
  startTimestamp: number;
  endTimestamp: number;
  total: {
    revenueUsd: number;
    blockCount: number;
  };
  byChain: Record<string, {
    chain: string;
    revenueUsd: number;
    blockCount: number;
  }>;
}

const fetchQuaiRevenues = async (options: FetchOptions) => {
  const { startTimestamp, endTimestamp, createBalances } = options;

  // Fetch daily revenue for the specified time range
  const response = await fetch(
    `${API_BASE}/api/revenues/daily?start=${startTimestamp}&end=${endTimestamp}`,
    {
      headers: { "accept": "application/json" },
      method: "GET",
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch Quai daily revenues: ${response.status}`);
  }

  const data: DailyRevenueResponse = await response.json();

  if (!data.success) {
    throw new Error("Invalid response from Quai daily revenues API");
  }

  const dailyFees = createBalances();
  const dailyRevenue = createBalances();
  const dailyHoldersRevenue = createBalances();

  // Add daily values (already in USD)
  // 100% of merged mining rewards go to buyback/burn of QUAI tokens
  if (data.total.revenueUsd > 0) {
    dailyFees.addUSDValue(data.total.revenueUsd);
    dailyRevenue.addUSDValue(data.total.revenueUsd);
    dailyHoldersRevenue.addUSDValue(data.total.revenueUsd);
  }

  return {
    dailyFees,
    dailyRevenue,
    dailyHoldersRevenue,
  };
};

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.QUAI]: {
      fetch: fetchQuaiRevenues,
      start: '2025-12-17',
    },
  },
  protocolType: ProtocolType.CHAIN,
  methodology: {
    Fees: "Block rewards and transaction fees earned from SOAP merged mining across Ravencoin (KAWPOW), Litecoin/Dogecoin (Scrypt), and Bitcoin Cash (SHA-256) chains. Values are calculated using the token price at the time each block was mined.",
    Revenue: "Same as fees - all SOAP merged mining block rewards accrue to the Quai Network as protocol revenue.",
    HoldersRevenue: "100% of revenue is used to buy back and burn QUAI tokens, benefiting token holders.",
  },
};

export default adapter;
