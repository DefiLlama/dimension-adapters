import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { addOneToken } from "../../helpers/prices";

const CURVE_PMM = "0x6Ccc8223532fff07f47EF4311BEB3647326894Ab";

const swapEvent =
  "event SwapExecuted(address recipient, bool xToY, uint256 dx, uint256 dy, uint256 fee)";

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();

  const [tokenX, tokenY] = await Promise.all([
    options.api.call({ target: CURVE_PMM, abi: "address:X" }),
    options.api.call({ target: CURVE_PMM, abi: "address:Y" }),
  ]);

  const logs = await options.getLogs({
    target: CURVE_PMM,
    eventAbi: swapEvent,
  });

  for (const log of logs) {
    const { xToY, dx, dy, fee } = log;
    addOneToken({ chain: options.chain, balances: dailyVolume, token0: tokenX, token1: tokenY, amount0: dx, amount1: dy });
    // Fee is taken from the output side: xToY → fee in Y, yToX → fee in X
    dailyFees.add(xToY ? tokenY : tokenX, fee);
  }

  return { dailyVolume, dailyFees };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.BASE]: {
      fetch,
      start: "2026-03-19",
    },
  },
};

export default adapter;
