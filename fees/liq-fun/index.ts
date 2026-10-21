// liq.fun — what traders pay on profitable closes: an impact haircut on the
// gain and a 2% fee on the gain after it. Losses carry no fee. The LP pool is
// protocol-owned (nobody can deposit into it), so everything is revenue.
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";

const STATS = "https://relay.liq.fun/stats";

const fetch = async (options: FetchOptions) => {
  const s = await httpGet(`${STATS}?from=${options.startTimestamp}&to=${options.endTimestamp}`);
  const dailyFees = options.createBalances();
  dailyFees.addUSDValue(s.winHaircutUsd, "Win Haircut");
  dailyFees.addUSDValue(s.winFeeUsd, "Win Fee");
  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true, // the endpoint answers any from/to window
  fetch,
  chains: [CHAIN.SOLANA],
  start: "2026-10-12",
  methodology: {
    Fees: "Charges paid by traders on profitable closes: an impact haircut on the gain and a 2% fee on the gain after the haircut. Losing closes and liquidations pay no fee.",
    UserFees: "Same as fees: all of it is paid by traders.",
    Revenue: "All fees are kept: the haircut stays in the protocol-owned LP pool and the win fee goes to the protocol.",
    ProtocolRevenue: "All fees are kept by the protocol.",
  },
  breakdownMethodology: {
    Fees: {
      "Win Haircut": "Impact haircut on the gain of a profitable close, sized by the price move; kept by the protocol-owned LP pool.",
      "Win Fee": "2% of the gain after the haircut on a profitable close.",
    },
    Revenue: {
      "Win Haircut": "Kept by the protocol-owned LP pool.",
      "Win Fee": "Kept by the protocol.",
    },
  },
};

export default adapter;
