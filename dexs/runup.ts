import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getCurveVolume, getMarketWindow } from "../fees/runup/shared";

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const window = await getMarketWindow(options);
  const curveVolume = await getCurveVolume(options, window);
  if (curveVolume > 0n) dailyVolume.add(window.quote, curveVolume);
  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.INJECTIVE],
  start: "2026-10-02",
  methodology: {
    Volume: "USDC value of every buy and sell on RunUp bonding curves, fees included, plus the RUNUP token's founding-sale tickets. Excludes trading in the pool a coin graduates into. Read from each market contract's own volume counter.",
  },
};

export default adapter;
