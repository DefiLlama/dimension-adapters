// liq.fun — what traders pay on profitable closes (an impact haircut on the
// gain and a 2% fee on the gain after it), plus the protocol's 2% cut of what
// losing closes and liquidations pay into the LP pool. The LP pool is
// protocol-owned (nobody can deposit into it), so everything is revenue.
// Deposits sit on Solana, but trades settle off-chain on the protocol's own
// server, so fees are attributed to off_chain.
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";

const STATS = "https://relay.liq.fun/stats";

const fetch = async (options: FetchOptions) => {
  const s = await httpGet(`${STATS}?from=${options.startTimestamp}&to=${options.endTimestamp}`);
  const dailyFees = options.createBalances();
  const dailyUserFees = options.createBalances();
  for (const b of [dailyFees, dailyUserFees]) {
    b.addUSDValue(s.winHaircutUsd, "Win Haircut");
    b.addUSDValue(s.winFeeUsd, "Win Fee");
  }
  // feesUsd is the protocol's two fees together: the win fee and 2% of losses.
  // The loss fee comes out of what the LP pool receives, not on top of the
  // trader's loss, so it is a fee to the protocol and not one traders pay
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
    Fees: "On profitable closes, an impact haircut on the gain and a 2% fee on the gain after the haircut; on losing closes and liquidations, a 2% fee on the margin lost, taken by the protocol from what the LP pool receives.",
    UserFees: "The haircut and the win fee on profitable closes. The loss fee is not included: it comes out of the LP pool's receipt, not on top of the trader's loss.",
    Revenue: "All fees (Win Haircut, Win Fee, Loss Fee) are kept: the haircut stays in the protocol-owned LP pool and the win fee goes to the protocol.",
    ProtocolRevenue: "All fees (Win Haircut, Win Fee, Loss Fee) are kept by the protocol.",
  },
  breakdownMethodology: {
    Fees: {
      "Win Haircut": "Impact haircut on the gain of a profitable close, sized by the price move; kept by the protocol-owned LP pool.",
      "Win Fee": "2% of the gain after the haircut on a profitable close.",
      "Loss Fee": "2% of the margin lost on a losing close or liquidation.",
    },
    UserFees: {
      "Win Haircut": "Impact haircut on the gain of a profitable close, paid by the trader.",
      "Win Fee": "2% of the gain after the haircut on a profitable close, paid by the trader.",
    },
    Revenue: {
      "Win Haircut": "Kept by the protocol-owned LP pool.",
      "Win Fee": "Kept by the protocol.",
      "Loss Fee": "Kept by the protocol.",
    },
  },
};

export default adapter;
