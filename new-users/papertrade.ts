import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getProtocolWindowDeltas } from "../helpers/papertrade";

const fetch = async (options: FetchOptions) => {
  // `users` is the cumulative count of unique accounts
  const { users } = await getProtocolWindowDeltas(options, ["users"]);
  return { dailyNewUsers: users };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.HYPERLIQUID],
  start: "2026-10-07", // first accounts funded during pre-deposits
  methodology: {
    NewUsers: "Accounts that funded a Papertrade trading balance for the first time, from the protocol's cumulative unique account count.",
  },
};

export default adapter;
