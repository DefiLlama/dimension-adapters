import { SimpleAdapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { addOneToken } from "../../helpers/prices";

const tempest = "0x00000003f1ec2379e79F58E12EC6C4F51Ee92149";
const swappedEvent = 'event Swapped(address indexed sender, address indexed tokenIn, address indexed tokenOut, uint256 amountIn, uint256 amountOut, address recipient)';

async function fetch(options: FetchOptions) {
  const { getLogs, createBalances } = options;
  const dailyVolume = createBalances();
  const logs = await getLogs({ target: tempest, eventAbi: swappedEvent });
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
  Volume: "Total value traded against Tempest, counted once per swap. Tempest is a market maker that fills orders out of its own token inventory instead of shared liquidity pools, so this counts only the trades it fills itself.",
}

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  pullHourly: true,
  chains: [CHAIN.ETHEREUM],
  start: "2026-08-03",
  methodology,
};

export default adapter;
