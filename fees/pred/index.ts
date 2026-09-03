import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { addTokensReceived } from "../../helpers/token";

const FEE_CONTRACT = "0x3Aa5A591f79Ae2A9790B7335fab875Bb0625A5bc";
const USDC = "0x833589fCD6eDb6E08f4c7c32D4f71b54bdA02913";

const fetch = async (options: FetchOptions) => {
  const dailyFees = await addTokensReceived({
    options,
    target: FEE_CONTRACT,
    token: USDC,
  });

  const dailyRevenue = dailyFees.clone(1, "Trading Fees");

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
  };
};

const methodology = {
  Fees: "Trading fees paid by users on Pred prediction-market trades on Base.",
  Revenue: "All recorded on-chain trade fees accrue to the protocol for the current deployment.",
  ProtocolRevenue: "All recorded on-chain trade fees accrue to the protocol for the current deployment.",
};

const breakdownMethodology = {
  Fees: {
    "Trading Fees": "Trade fees charged by Pred on each order fill on the Base exchange contracts.",
  },
  Revenue: {
    "Trading Fees": "Trade fees charged by Pred on each order fill on the Base exchange contracts.",
  },
  ProtocolRevenue: {
    "Trading Fees": "Trade fees charged by Pred on each order fill on the Base exchange contracts.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  adapter: {
    [CHAIN.BASE]: {
      fetch,
      start: "2026-02-05",
    },
  },
  methodology,
  breakdownMethodology,
};

export default adapter;
