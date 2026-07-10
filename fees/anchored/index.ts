import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";
import { fetchAnchoredDimensions, toNumber } from "../../helpers/anchored";

const fetch = async (options: FetchOptions) => {
  const data = await fetchAnchoredDimensions(options);

  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();

  dailyFees.addUSDValue(toNumber(data.dailyFees), METRIC.TRADING_FEES);
  dailyRevenue.addUSDValue(toNumber(data.dailyRevenue), METRIC.TRADING_FEES);

  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
  };
};

const methodology = {
  Fees: "Trading fees paid by users on settled filled tokenized stock trades, including mint fees and protocol fees.",
  UserFees: "All tracked fees are paid directly by users when trades settle.",
  Revenue: "Protocol revenue is the protocol fee portion kept by Anchored.",
  ProtocolRevenue: "Protocol revenue is allocated to the protocol treasury.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.TRADING_FEES]: "Mint fees plus protocol fees paid by users on settled filled tokenized stock trades.",
  },
  UserFees: {
    [METRIC.TRADING_FEES]: "Mint fees plus protocol fees paid by users on settled filled tokenized stock trades.",
  },
  Revenue: {
    [METRIC.TRADING_FEES]: "Protocol fee portion kept by Anchored.",
  },
  ProtocolRevenue: {
    [METRIC.TRADING_FEES]: "Protocol fee portion allocated to the protocol treasury.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  chains: [CHAIN.ETHEREUM, CHAIN.MONAD],
  fetch,
  start: "2026-02-01",
  methodology,
  breakdownMethodology,
};

export default adapter;
