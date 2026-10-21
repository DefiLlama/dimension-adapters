// liq.fun — flash perps on the $PUMP price, settled against a protocol-owned
// LP pool. Volume is notional (stake x leverage), counted once per trade at
// the open, for trades closed in the window. Served by the protocol's relay.
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";

const STATS = "https://relay.liq.fun/stats";

const fetch = async (options: FetchOptions) => {
  const s = await httpGet(`${STATS}?from=${options.startTimestamp}&to=${options.endTimestamp}`);
  const dailyVolume = options.createBalances();
  dailyVolume.addUSDValue(s.volumeUsd);
  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true, // the endpoint answers any from/to window
  fetch,
  chains: [CHAIN.SOLANA],
  start: "2026-10-12",
  methodology: {
    Volume: "Notional value of perpetual positions (stake x leverage), counted once per trade, for trades closed in the period.",
  },
};

export default adapter;
