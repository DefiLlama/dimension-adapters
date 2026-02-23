import { SimpleAdapter, FetchOptions, Dependencies } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getSolanaReceived } from "../helpers/token";
import { METRIC } from "../helpers/metrics";

const TREASURY_ADDRESS = "MoEcUAUh3zC8gGMh2wiRJx3ShbAoHqpxLKeGfJ1KFcm";

const fetch = async (_timestamp: number, _: any, options: FetchOptions) => {
  const { createBalances } = options;
  const dailyFees = createBalances();
  
  const received = await getSolanaReceived({
    options,
    target: TREASURY_ADDRESS,
  });
  
  dailyFees.addBalances(received, METRIC.SERVICE_FEES);

  return {
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  };
};

const breakdownMethodology = {
  Fees: {
    [METRIC.SERVICE_FEES]: "Platform commission charged on each betting match pot, calculated as 3% of the total pot value. Collected when betting matches conclude and transferred to the protocol treasury.",
  },
  Revenue: {
    [METRIC.SERVICE_FEES]: "All betting platform fees are retained by the protocol as there are no intermediaries or supply-side participants to pay out.",
  },
  ProtocolRevenue: {
    [METRIC.SERVICE_FEES]: "100% of betting platform fees are collected by the protocol treasury to fund operations and development.",
  },
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.SOLANA],
  start: "2025-02-20",
  isExpensiveAdapter: true,
  dependencies: [Dependencies.ALLIUM],
  methodology: {
    Fees: "Platform fees (3%) collected from betting match pots on the RoyalBet Telegram bot.",
    Revenue: "All fees are protocol revenue.",
    ProtocolRevenue: "All fees are collected by the protocol treasury.",
  },
  breakdownMethodology,
};

export default adapter;
