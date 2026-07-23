import { SimpleAdapter, Dependencies, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import {
  addTokensReceived,
  getETHReceived,
  getSolanaReceived,
} from "../helpers/token";

const EVM_FEE_COLLECTORS = [
  "0x1dd9eef96646ad40d58da28d1878e7f223d5e8ba",
  "0xd32c062c12C2D10BeC0187DD334cC15E0367f9AC",
];
const SOLANA_FEE_COLLECTORS = [
  "7BLh5LjJToh81ZZZyYC4aCv7cHzXgdfhHYyqLtdbuYdt",
  "7vp7ShRHw6heQJfuVE5GDQrUbooLkWKsgAezRj2Zad1L",
];

const fetchEvm = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();

  // Collect every ERC-20 token transfer routed to the fee collectors
  await addTokensReceived({
    options,
    targets: EVM_FEE_COLLECTORS,
    balances: dailyFees,
  });

  // Add any native gas-token transfers (covers direct ETH top ups)
  await getETHReceived({
    options,
    targets: EVM_FEE_COLLECTORS,
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
    targets: SOLANA_FEE_COLLECTORS,
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
  pullHourly: true,
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
