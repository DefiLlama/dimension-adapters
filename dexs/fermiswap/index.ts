import { SimpleAdapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { addOneToken } from "../../helpers/prices";

const router = "0xb1076fE3AB5e28005C7c323Bac5AC06a680d452e";
const swapEvent = 'event FermiSwap(address indexed recipient, address indexed tokenIn, address indexed tokenOut, uint256 amountIn, uint256 amountOut)'

async function fetch(options: FetchOptions) {
  const { getLogs, createBalances } = options;
  const dailyVolume = createBalances();
  const logs = await getLogs({ target: router, eventAbi: swapEvent });
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

const adapter: SimpleAdapter = {
    version: 2,
    fetch,
    pullHourly: true,
    chains: [CHAIN.ETHEREUM],
    start: "2026-05-12",
};

export default adapter;
