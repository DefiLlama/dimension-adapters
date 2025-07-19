import { FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getSolanaReceived } from "../../helpers/token";

const fetch = async (options: FetchOptions) => {
  const dailyFees = await getSolanaReceived({
    options,
    targets: ['Dpo148tVGewDPyh2FkGV18gouWctbdX2fHJopJGe9xv1']
  });

  return { dailyFees, dailyRevenue: dailyFees }
}

const meta = {
  methodology: {
    Fees: 'Includes 0.1% instant withdrawal fee and  0.1% delayed withdrawal fee',
    Revenue: 'All fees going to treasury/DAO (50% of total fees) + All fees going to the team(50% of total fees)',
  }
}

export default {
  version: 2,
  adapter: {
    [CHAIN.SOLANA]: {
      fetch,
      start: "2022-12-07",
      meta
    }
  }
};