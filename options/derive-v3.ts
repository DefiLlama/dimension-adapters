import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getDeriveTrades } from "../helpers/derive";

const fetch = async (options: FetchOptions) => {
  const dailyNotionalVolume = options.createBalances();
  const dailyPremiumVolume = options.createBalances();
  for (const trade of await getDeriveTrades(options, "option")) {
    if (trade.liquidity_role !== "taker") continue; // maker rows duplicate the taker row of the same trade
    const amount = Number(trade.trade_amount);
    dailyNotionalVolume.addUSDValue(amount * Number(trade.index_price));
    dailyPremiumVolume.addUSDValue(amount * Number(trade.trade_price));
  }
  return { dailyNotionalVolume, dailyPremiumVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.DERIVE_V3],
  start: "2026-10-06", // v3 cutover
  methodology: {
    NotionalVolume: "Notional value of options traded on Derive.",
    PremiumVolume: "Premium paid on options traded on Derive.",
  },
};

export default adapter;
