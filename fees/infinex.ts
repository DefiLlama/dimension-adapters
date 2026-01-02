import { SimpleAdapter, Dependencies, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import {
  addTokensReceived,
  getETHReceived,
  getSolanaReceived,
} from "../helpers/token";

const EVM_FEE_COLLECTOR = "0x1dd9eef96646ad40d58da28d1878e7f223d5e8ba";
const SOLANA_FEE_COLLECTOR = "7BLh5LjJToh81ZZZyYC4aCv7cHzXgdfhHYyqLtdbuYdt";

const fetchEvm = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();

  // Collect every ERC-20 token transfer routed to the fee collector
  await addTokensReceived({
    options,
    target: EVM_FEE_COLLECTOR,
    balances: dailyFees,
  });

  // Add any native gas-token transfers (covers direct ETH top ups)
  await getETHReceived({
    options,
    target: EVM_FEE_COLLECTOR,
    balances: dailyFees,
  });

  return {
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  };
};

const fetchSolana = async (options: FetchOptions) => {
  const dailyFees = await getSolanaReceived({
    options,
    target: SOLANA_FEE_COLLECTOR,
  });

  return {
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  };
};

const methodology = {
  Fees: "All tokens routed to Infinex swap fee collectors across supported chains (USD-converted via Allium).",
  Revenue: "All collected swap fees accrue to Infinex.",
  ProtocolRevenue: "All collected swap fees accrue to Infinex.",
};

const adapter: SimpleAdapter = {
  version: 2,
  dependencies: [Dependencies.ALLIUM],
  methodology,
  isExpensiveAdapter: true,
  adapter: {
    [CHAIN.ETHEREUM]: { fetch: fetchEvm, start: "2025-12-23" },
    [CHAIN.ARBITRUM]: { fetch: fetchEvm, start: "2025-12-23" },
    [CHAIN.BASE]: { fetch: fetchEvm, start: "2025-12-23" },
    [CHAIN.OPTIMISM]: { fetch: fetchEvm, start: "2025-12-23" },
    [CHAIN.POLYGON]: { fetch: fetchEvm, start: "2025-12-23" },
    [CHAIN.BSC]: { fetch: fetchEvm, start: "2025-12-23" },
    [CHAIN.SOLANA]: { fetch: fetchSolana, start: "2025-12-23" },
  },
};

export default adapter;
