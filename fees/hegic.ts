import { Adapter, FetchOptions, FetchResultFees } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { loadPositions, getDailyPayoffs, USDCE, HEGIC_HERGE_START } from "../options/hegic";

// The Stake & Cover pool is the counterparty on both sides of the book, so fees are netted
// at the treasury cash level.
async function fetch(options: FetchOptions): Promise<FetchResultFees> {
  const positions = await loadPositions(options);

  const dailyFees = options.createBalances();
  for (const p of positions) dailyFees.add(USDCE, p.positivepnl, "Net Options Premiums");

  const payoffs = await getDailyPayoffs(options);
  dailyFees.subtract(payoffs, "Net Options Premiums");

  return {
    dailyFees,
    dailyRevenue: dailyFees,
    dailyHoldersRevenue: dailyFees,
  };
}

const adapter: Adapter = {
  version: 2,
  methodology: {
    Fees: "Net premiums retained by the Hegic Stake & Cover pool: everything users pay into the Operational Treasury to open options/strategies, minus everything the treasury pays out on settlement.",
    Revenue: "The same as Fees, the Stake & Cover pool keeps all of its net premiums.",
    HoldersRevenue: "100% of net premiums accrue to HEGIC Stake & Cover pool participants.",
  },
  breakdownMethodology: {
    Fees: {
      "Net Options Premiums": "Premiums paid in to open options/strategies, minus payoffs paid out on settlement.",
    },
    Revenue: {
      "Net Options Premiums": "Premiums paid in to open options/strategies, minus payoffs paid out on settlement.",
    },
    HoldersRevenue: {
      "Net Options Premiums": "Net premiums distributed to HEGIC Stake & Cover pool participants.",
    },
  },
  allowNegativeValue: true, // the pool books a loss on periods where payoffs exceed premiums
  chains: [CHAIN.ARBITRUM],
  fetch,
  start: HEGIC_HERGE_START,
  pullHourly: true,
};

export default adapter;
