// Derive v3 options markets: notional and premium volume
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
  chains: [CHAIN.DERIVE_V3], // v3 zkVM exchange, listed as its own chain like the v2 Derive Chain (lyra) it replaces
  start: "2026-10-06", // v3 cutover, the v2 listing (lyra-v2) is dead from this date
  methodology: {
    NotionalVolume: "Underlying notional (amount times index price) of options traded on Derive, counted once per trade.",
    PremiumVolume: "Premium paid by option buyers on Derive, counted once per trade.",
  },
};

export default adapter;
