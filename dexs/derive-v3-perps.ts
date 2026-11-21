import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getDeriveTrades } from "../helpers/derive";

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  for (const trade of await getDeriveTrades(options, "perp")) {
    if (trade.liquidity_role === "taker") // maker rows duplicate the taker row of the same trade
      dailyVolume.addUSDValue(Number(trade.trade_amount) * Number(trade.trade_price));
  }
  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.DERIVE_V3],
  start: "2026-10-06", // v3 cutover
  methodology: { Volume: "Perpetual trading volume on Derive." },
};

export default adapter;
