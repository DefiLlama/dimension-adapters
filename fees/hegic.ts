import { Adapter, FetchOptions, FetchResultFees } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { loadPositions, getDailyPayoffs, USDCE, HEGIC_HERGE_START } from "../options/hegic";

async function fetch(options: FetchOptions): Promise<FetchResultFees> {
  const positions = await loadPositions(options);

  const dailyFees = options.createBalances();
  for (const p of positions) dailyFees.add(USDCE, p.premium, "Options premiums");

  const dailySupplySideRevenue = await getDailyPayoffs(options);

  const dailyRevenue = dailyFees.clone();
  dailyRevenue.subtract(dailySupplySideRevenue, "Options premiums");

  return {
    dailyFees,
    dailySupplySideRevenue,
    dailyRevenue,
    dailyHoldersRevenue: dailyRevenue,
  };
}

const adapter: Adapter = {
  version: 2,
  methodology: {
    Fees: "Premiums paid by users to buy options/strategies, recognised when the option is bought. For inverse (option-selling) strategies the premium is the option's fair value, not the net collateral transferred in.",
    SupplySideRevenue: "Payoffs the Stake & Cover pool pays out when options are exercised in-the-money. Inverse-strategy payoffs return the seller's collateral and are excluded.",
    Revenue: "Net premiums retained by the Hegic Stake & Cover pool (premiums collected minus payoffs paid out).",
    HoldersRevenue: "100% of net premiums accrue to HEGIC Stake & Cover pool participants.",
  },
  breakdownMethodology: {
    Fees: {
      "Options premiums": "Option premiums paid by users across calls, puts, and option strategies.",
    },
    SupplySideRevenue: {
      "Options payoffs": "Payoffs paid to holders who exercised standard options in-the-money.",
    },
    Revenue: {
      "Options premiums": "Net premiums retained by the Stake & Cover pool after paying out exercised options.",
    },
    HoldersRevenue: {
      "Options premiums": "Net premiums distributed to HEGIC Stake & Cover pool participants.",
    },
  },
  allowNegativeValue: true, // payoffs can exceed same-day premiums
  chains: [CHAIN.ARBITRUM],
  fetch,
  start: HEGIC_HERGE_START,
  pullHourly: true,
};

export default adapter;
