import { FetchOptions, FetchV2, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { addOneToken } from "../../helpers/prices";

const SWAP_EVENT_ABI = "event Swap(address indexed sender, address indexed input, address indexed output, uint256 amountIn, uint256 amountOut, uint256 swapFee)";

const CONFIG = {
  [CHAIN.ZORA]: "0x0FeeCCFaa507d20c2b18a6381080C062d52DbF00",
  [CHAIN.BASE]: "0x0Fee3Fa06550723cbf8590AC2f769F2F603e4000",
  [CHAIN.SCROLL]: "0x0Feeb68668672B3d6bF3E01455164a24B266c400",
};

const fetch: FetchV2 = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  
  const address = CONFIG[options.chain];
  const logs = await options.getLogs({
    target: address,
    eventAbi: SWAP_EVENT_ABI,
  });
  logs.forEach((log: any) => {
    const [,input, output, amountIn, amountOut, swapFee] = log;

    addOneToken({
      balances: dailyVolume,
      chain: options.chain,
      token0: input,
      token1: output,
      amount0: amountIn,
      amount1: amountOut,
    });

    dailyFees.addGasToken(swapFee);
  });

  return {
    dailyVolume,
    dailyFees,
  }
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  adapter: {
    [CHAIN.ZORA]: {
      fetch,
      start: '2024-12-17',
    },
    [CHAIN.BASE]: {
      fetch,
      start: '2024-12-17',
    },
    [CHAIN.SCROLL]: {
      fetch,
      start: '2024-12-17',
    },
  }
}

export default adapter;
