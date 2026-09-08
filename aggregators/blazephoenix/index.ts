import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { addOneToken } from "../../helpers/prices";

const event_swap = 'event Swap(address indexed user, address indexed tokenIn, address indexed tokenOut, uint256 amountIn, uint256 amountOut, uint256 legs)';

const chainConfig: Record<string, { router: string, start: string }> = {
  [CHAIN.BASE]: { router: "0x2a779f9Be49aac57495A8B6467Cc325a8a47Eb9f", start: "2026-07-08" },
  [CHAIN.ETHEREUM]: { router: "0xE1aE5f49013920CF71De8CED4043e14C4d63416b", start: "2026-07-08" },
  [CHAIN.OPTIMISM]: { router: "0x7262e7483ab6f0db7b8f90eC3a9de3B02Ab36F6A", start: "2026-07-08" },
  [CHAIN.ARBITRUM]: { router: "0x7262e7483ab6f0db7b8f90eC3a9de3B02Ab36F6A", start: "2026-07-08" },
  [CHAIN.ROBINHOOD]: { router: "0x7262e7483ab6f0db7b8f90eC3a9de3B02Ab36F6A", start: "2026-07-22" },
};

const fetch = async (options: FetchOptions) => {
  const { router } = chainConfig[options.chain];
  const dailyVolume = options.createBalances();

  const logs = await options.getLogs({
    target: router,
    eventAbi: event_swap,
  });

  logs.forEach((log: any) => {
    addOneToken({ balances: dailyVolume, token0: log.tokenIn, amount0: log.amountIn, token1: log.tokenOut, amount1: log.amountOut });
  });

  return {
    dailyVolume,
  };
};

const methodology = {
  Volume: "Total swap volume routed by the blazephoenix router",
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  adapter: chainConfig,
  fetch,
  methodology,
};

export default adapter;
