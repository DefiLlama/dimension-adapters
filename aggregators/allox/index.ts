import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { addTokensReceived } from "../../helpers/token";

const FEE_RECIPIENT = "0x6A80f57ac54123cB71e6c79B3935A381b87B4308";

const configs: Record<string, any> = {
  [CHAIN.BSC]: {
    start: "2026-03-17",
  },
  [CHAIN.BASE]: {
    start: "2026-04-22",
  },
  [CHAIN.ETHEREUM]: {
    start: "2026-05-05",
  },
};

const fetch = async (options: FetchOptions) => {
  const dailyFees = await addTokensReceived({
    options,
    target: FEE_RECIPIENT,
  });

  // flat 0.25% fee on trades, volume is scaled by 400
  return { dailyVolume: dailyFees.clone(400) };
};

const adapter: Adapter = {
  version: 2,
  pullHourly: true,
  adapter: configs,
  fetch,
  methodology: {
    Volume: 'Total USD value of swaps AlloX routed through Uniswap (V2/V3/V4 Universal Router) and PancakeSwap (Universal Router).',
  }
};

export default adapter;
