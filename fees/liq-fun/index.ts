// liq.fun PERPS — the protocol's two fees on flash perps: 2% of the gain on a
// profitable close (after the impact haircut), and 2% of the margin lost on a
// losing close or liquidation, taken from what the LP pool receives.
// The impact haircut is not a fee: it is how the payout curve prices a win,
// and the LP pool is the trader's counterparty, so what it keeps or pays is
// trading PnL, not revenue. Trades settle off-chain on the protocol's own
// server, so fees are attributed to off_chain.
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";

const STATS = "https://relay.liq.fun/stats";

const fetch = async (options: FetchOptions) => {
  const s = await httpGet(`${STATS}?from=${options.startTimestamp}&to=${options.endTimestamp}`);
  if (typeof s?.feesUsd !== "number" || typeof s?.winFeeUsd !== "number") throw new Error("liq.fun stats: fee fields missing");
  const dailyFees = options.createBalances();
  const dailyUserFees = options.createBalances();
  dailyFees.addUSDValue(s.winFeeUsd, "Win Fee");
  dailyUserFees.addUSDValue(s.winFeeUsd, "Win Fee");
  // feesUsd is the two fees together; the loss fee comes out of what the LP
  // pool receives, not on top of the trader's loss, so it is not a user fee.
  dailyFees.addUSDValue(Math.max(0, s.feesUsd - s.winFeeUsd), "Loss Fee");
  return {
    dailyFees,
    dailyUserFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true, // the endpoint answers any from/to window
  fetch,
  chains: [CHAIN.OFF_CHAIN],
  start: "2026-10-12",
  methodology: {
    Fees: "2% of the trader's gain on profitable perp closes plus 2% of the margin lost on losing closes and liquidations; the impact haircut on wins and the LP pool's trading profit or loss against traders are not counted.",
    UserFees: "The 2% fee traders pay on the gain of a profitable perp close; the 2% loss fee is excluded because it is taken from what the LP pool receives, not charged on top of the trader's loss.",
    Revenue: "The 2% fee on profitable perp-close gains and the 2% fee on margin lost in losing closes and liquidations, all kept by the protocol.",
    ProtocolRevenue: "The 2% fee on profitable perp-close gains and the 2% fee on margin lost in losing closes and liquidations, all kept by the protocol.",
  },
  breakdownMethodology: {
    Fees: {
      "Win Fee": "2% of the trader's gain on a profitable close, charged after the impact haircut.",
      "Loss Fee": "2% of the margin lost on a losing close or liquidation, taken out of what the LP pool receives.",
    },
    UserFees: {
      "Win Fee": "2% of the gain on a profitable close, paid by the trader.",
    },
    Revenue: {
      "Win Fee": "2% fee on the gain of profitable closes, kept by the protocol.",
      "Loss Fee": "2% fee on the margin lost in losing closes and liquidations, kept by the protocol.",
    },
    ProtocolRevenue: {
      "Win Fee": "2% fee on the gain of profitable closes, kept by the protocol.",
      "Loss Fee": "2% fee on the margin lost in losing closes and liquidations, kept by the protocol.",
    },
  },
};

export default adapter;
