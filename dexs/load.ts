import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { collectLoadDimensions } from "../fees/load";

const fetch = async (options: FetchOptions) => {
  const d = await collectLoadDimensions(options);
  return { dailyVolume: d.dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ARC],
  start: "2026-09-17",
  methodology: {
    Volume:
      "Bonding-curve USDC notional from Trade events, Instant/graduated V3 Load-router notional (0.25% fee × 400), and GraduatedSwap USDC on the V4 Load router. Uniswap pool volume that never hits a Load router is excluded.",
  },
};

export default adapter;
