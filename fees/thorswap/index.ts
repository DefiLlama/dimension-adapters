import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { addFees, getChainStats, adapterChains } from "../../helpers/aggregators/thorchain";

const fetch = async (options: FetchOptions) => {
  const chain = await getChainStats(options);
  // the API sends fee lists only where swaps recorded a fee; without them the fee is unknown, not zero
  if (!chain?.fees) return {};

  const dailyFees = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();
  addFees(dailyFees, chain.fees);
  addFees(dailyProtocolRevenue, chain.protocolRevenue ?? []);
  addFees(dailyHoldersRevenue, chain.holdersRevenue ?? []);

  const dailyRevenue = options.createBalances();
  dailyRevenue.addBalances(dailyProtocolRevenue);
  dailyRevenue.addBalances(dailyHoldersRevenue);

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue,
    dailyHoldersRevenue,
  };
};

const methodology = {
  Fees: "Swap fees users pay the protocol on top of the route, counted in the hour the swap was created on the chain it sold from. The protocol started charging swap fees on 2022-04-24, so fees before that date are zero.",
  Revenue: "All swap fees, split between the treasury and THOR stakers and buyback.",
  ProtocolRevenue: "25% of swap fees, paid to the treasury.",
  HoldersRevenue: "75% of swap fees, which goes to THOR stakers and THOR buyback.",
};

const breakdownMethodology = {
  Fees: {
    "Swap Fees": "Fees users pay the protocol on swaps.",
  },
  Revenue: {
    "Swap Fees To Treasury": "25% of swap fees, paid to the treasury.",
    "Swap Fees To THOR Stakers And Buyback": "75% of swap fees, which goes to THOR stakers and THOR buyback.",
  },
  ProtocolRevenue: {
    "Swap Fees To Treasury": "25% of swap fees, paid to the treasury.",
  },
  HoldersRevenue: {
    "Swap Fees To THOR Stakers And Buyback": "75% of swap fees, which goes to THOR stakers and THOR buyback.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  adapter: adapterChains(),
  methodology,
  breakdownMethodology,
};

export default adapter;
