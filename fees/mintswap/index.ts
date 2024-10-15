import { FetchOptions, FetchV2, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { addOneToken } from "../../helpers/prices";

const SWAP_EVENT_ABI = "event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)";

const CONFIG = {
  [CHAIN.MINT]: {
    factory: "0x1f88BB455E02646224A0a65f3eb4B2FCb4fb8e49", 
    fromBlock: 10, 
    swapFee: 3000n, 
  },
};

type Pair = {
  id: string,
  currency0: string;
  currency1: string;
};

const getTokenPairs = async (options: FetchOptions): Promise<{[id: string]: Pair}> => {
  const config = CONFIG[options.chain];

  const logs = await options.api.getLogs({
    target: config.factory,
    eventAbi: SWAP_EVENT_ABI,
    fromBlock: config.fromBlock,
    toBlock: options.api.block,
    onlyArgs: true,
  });

  const pairs = logs.map(log => {
    const [id, currency0, currency1] = log;
    return { id, currency0, currency1 };
  });

  return Object.fromEntries(pairs.map(pair => [pair.id, pair]));
};

const fetchVolumeAndFees: FetchV2 = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const pairs = await getTokenPairs(options);

  const config = CONFIG[options.chain];
  const logs = await options.api.getLogs({
    target: config.factory,
    eventAbi: SWAP_EVENT_ABI,
    fromBlock: config.fromBlock,
    toBlock: options.api.block,
  });

  logs.forEach(log => {
    const [id, , amount0, amount1] = log;
    const pair = pairs[id];

    const volumeAmount0 = BigInt(amount0);
    const volumeAmount1 = BigInt(amount1);
    const feeAmount0 = (volumeAmount0 * config.swapFee) / 1000000n;
    const feeAmount1 = (volumeAmount1 * config.swapFee) / 1000000n;

    addOneToken({
      balances: dailyVolume,
      chain: options.chain,
      token0: pair.currency0,
      token1: pair.currency1,
      amount0: volumeAmount0,
      amount1: volumeAmount1,
    });

    addOneToken({
      balances: dailyFees,
      chain: options.chain,
      token0: pair.currency0,
      token1: pair.currency1,
      amount0: feeAmount0,
      amount1: feeAmount1,
    });
  });

  return {
    dailyVolume,
    dailyFees,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.MINT]: {
      fetch: fetchVolumeAndFees,
      start: 1715942400,
    },
  },
};

export default adapter;

