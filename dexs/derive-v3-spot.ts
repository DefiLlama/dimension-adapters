import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getDeriveTrades } from "../helpers/derive";

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  for (const trade of await getDeriveTrades(options, "erc20")) {
    if (!trade.instrument_name.endsWith("-USDC")) continue; // USDC-quoted pairs only, so price is USD
    if (trade.liquidity_role === "taker") // maker rows duplicate the taker row of the same trade
      dailyVolume.addUSDValue(Number(trade.trade_amount) * Number(trade.trade_price));
  }
  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  adapter: {
    [CHAIN.LYRA]: { start: "2024-07-12", deadFrom: "2026-10-06" }, // no v2 spot listing, history stays on Derive Chain
    [CHAIN.DERIVE_V3]: { start: "2026-10-06" },
  },
  methodology: { Volume: "Notional volume of spot trades on Derive, counted once per trade." },
};

export default adapter;
