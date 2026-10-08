// Derive v3 perpetual markets: taker notional volume
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
  chains: [CHAIN.ETHEREUM], // v3 custody and settlement proofs live on Ethereum mainnet, Derive Chain is being wound down
  start: "2026-10-06", // v3 cutover, the v2 listing (lyra) is dead from this date
  methodology: { Volume: "Notional volume of perpetual trades on Derive, counted once per trade." },
};

export default adapter;
