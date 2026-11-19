import { SimpleAdapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { addOneToken } from "../../helpers/prices";

const taurusfi = "0x20861433D9119B866EEB398cb1ad46652A3cF953";
const swappedEvent = 'event Swapped(address indexed sender, address indexed tokenIn, address indexed tokenOut, uint256 amountIn, uint256 amountOut, address recipient)';

async function fetch(options: FetchOptions) {
  const { getLogs, createBalances } = options;
  const dailyVolume = createBalances();
  const logs = await getLogs({ target: taurusfi, eventAbi: swappedEvent });
  logs.forEach((log: any) => {
    addOneToken({
      chain: options.chain,
      balances: dailyVolume,
      token0: log.tokenIn,
      amount0: log.amountIn,
      token1: log.tokenOut,
      amount1: log.amountOut
    })
  });
  return { dailyVolume };
}

const methodology = {
  Volume: "Total value traded against TaurusFi, counted once per swap. TaurusFi is a market maker that fills orders out of its own token inventory instead of shared liquidity pools, so this counts only the trades it fills itself.",
}

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  pullHourly: true,
  chains: [CHAIN.ETHEREUM],
  start: "2026-10-15",
  methodology,
};

export default adapter;
