import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getAftermathMarkets } from "../helpers/aftermath";

const fetch = async (options: FetchOptions) => {
  const markets = await getAftermathMarkets();
  const openInterestAtEnd = options.createBalances();
  for (const market of markets) {
    const openInterest = market.marketState?.openInterest;
    if (!Number.isFinite(openInterest) || openInterest < 0)
      throw new Error(`Invalid Aftermath open interest: ${market.objectId}`);
    // An explicitly empty market contributes zero even if its oracle has not started yet.
    if (openInterest === 0) continue;
    if (!Number.isFinite(market.indexPrice) || market.indexPrice <= 0)
      throw new Error(`Invalid Aftermath open interest or index price: ${market.objectId}`);
    // API decodes the on-chain 18-decimal fixed-point amount to base tokens. OI counts longs
    // once; multiply by the USD index price without a contractSize or collateral-decimal factor.
    openInterestAtEnd.addUSDValue(openInterest * market.indexPrice, "Open Interest");
  }

  return { openInterestAtEnd };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: false, // The API only serves current OI; daily snapshots must not sum hourly values.
  fetch,
  chains: [CHAIN.SUI],
  runAtCurrTime: true,
};

export default adapter;
