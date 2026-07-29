import { cache } from "@defillama/sdk";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { addOneToken } from "../../helpers/prices";
import { CHAIN_CONFIG } from "./config";
import { addUsdnVolume } from "./usdn-volume";

const SWAP_EVENT = "event Swap(address indexed sender, address indexed to, int256 amount0, int256 amount1)";

export async function getAmmSwapVolume(options: FetchOptions) {
  const factory = CHAIN_CONFIG.FACTORIES[options.chain].toLowerCase();
  const cacheKey = `tvl-adapter-cache/cache/uniswap-forks/${factory}-${options.chain}.json`;
  let { pairs, token0s, token1s } = await cache.readCache(cacheKey, { readFromR2Cache: true });
  if (!pairs?.length) {
    const pairsLength = await options.api.call({ target: factory, abi: "uint256:allPairsLength" });
    const calls = [];
    for (let i = 0; i < Number(pairsLength); i++) calls.push({ target: factory, params: [i] });
    pairs = await options.api.multiCall({ abi: "function allPairs(uint256) view returns (address)", calls });
    token0s = await options.api.multiCall({ abi: "address:token0", calls: pairs });
    token1s = await options.api.multiCall({ abi: "address:token1", calls: pairs });
  }

  const dailyVolume = options.createBalances();
  const allLogs = await options.getLogs({ targets: pairs, eventAbi: SWAP_EVENT, flatten: false });
  allLogs.forEach((logs: any[], i: number) => {
    for (const log of logs) {
      addOneToken({ chain: options.chain, balances: dailyVolume, token0: token0s[i], token1: token1s[i], amount0: log.amount0, amount1: log.amount1 });
    }
  });
  return dailyVolume;
}

async function fetch(options: FetchOptions) {
  const dailyVolume = await getAmmSwapVolume(options);
  if (options.chain === CHAIN.ETHEREUM) await addUsdnVolume(options, dailyVolume);
  return { dailyVolume };
}

const adapter: SimpleAdapter = { adapter: {}, version: 2 };

Object.keys(CHAIN_CONFIG.FACTORIES).forEach((chain: string) => {
  adapter.adapter![chain] = {
    fetch,
    start: CHAIN_CONFIG.START_TIMES[chain],
  };
});

export default adapter;
