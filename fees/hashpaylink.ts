import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { addTokensReceived } from "../helpers/token";

const EVM_TREASURY = "0xcE5dF9e1115F81a2Fc2F65941B20B820d508e753";
const LABEL = "Payment Fees";

const fetchEvm = async (options: FetchOptions) => {
  const paymentFees = await addTokensReceived({
    options,
    target: EVM_TREASURY,
  })

  const dailyFees = options.createBalances();
  dailyFees.add(paymentFees, LABEL);
  
  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch: fetchEvm,
      start: "2026-05-01",
    },
    [CHAIN.BASE]: {
      fetch: fetchEvm,
      start: "2026-05-01",
    },
  },
  methodology: {
    Fees: "Hash PayLink charges a 0.2% platform fee on successful payment settlement. Sponsored smart-wallet payments may also route a small USDC gas recovery amount to the treasury in the same settlement.",
    UserFees: "Fees are paid by payers as part of the Hash PayLink payment transaction.",
    Revenue: "All tracked fees are collected by the Hash PayLink treasury.",
    ProtocolRevenue: "All tracked fees accrue to the Hash PayLink protocol treasury.",
  },
  breakdownMethodology: {
    Fees: {
      [LABEL]: "USDC transfers received by the Hash PayLink treasury from payment settlement flows.",
    },
    UserFees: {
      [LABEL]: "USDC platform fees and sponsored gas recovery amounts paid by users during settlement.",
    },
    Revenue: {
      [LABEL]: "100% of tracked settlement fees are protocol revenue.",
    },
    ProtocolRevenue: {
      [LABEL]: "100% of tracked settlement fees accrue to the protocol treasury.",
    },
  },
};

export default adapter;
