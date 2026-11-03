// liq.fun PREDICTIONS (CANDLES) — a player predicts the next ten 10-second
// $PUMP candles green or red with a stake; a streak from the first pays by a
// fixed table. The protocol takes 2% of every stake on a game that plays out
// (a game voided by an oracle gap is refunded in full, fee included). Games
// settle off-chain on the protocol's own server, so fees are attributed to
// off_chain.
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";

const STATS = "https://relay.liq.fun/stats";

const fetch = async (options: FetchOptions) => {
  const s = await httpGet(`${STATS}?from=${options.startTimestamp}&to=${options.endTimestamp}`);
  if (typeof s?.candles?.feeUsd !== "number") throw new Error("liq.fun stats: candles fee missing");
  const dailyFees = options.createBalances();
  dailyFees.addUSDValue(s.candles.feeUsd, "Stake Fee");
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
  chains: [CHAIN.OFF_CHAIN],
  start: "2026-11-03",
  methodology: {
    Fees: "2% of every stake on a game that plays out; a voided game is refunded in full.",
    UserFees: "The 2% stake fee, paid by the player out of the stake.",
    Revenue: "The stake fee goes to the protocol.",
    ProtocolRevenue: "The stake fee goes to the protocol.",
  },
  breakdownMethodology: {
    Fees: { "Stake Fee": "2% of the stake of a game that played out." },
    UserFees: { "Stake Fee": "2% of the stake, paid by the player." },
    Revenue: { "Stake Fee": "Kept by the protocol." },
  },
};

export default adapter;
