import type { FetchOptions, FetchResult, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { addOneToken } from "../helpers/prices";

const cryptoSwapEvent = 'event TokenExchange(address indexed buyer, uint256 sold_id, uint256 tokens_sold, uint256 bought_id, uint256 tokens_bought, uint256 fee, uint256 packed_price_scale)'

const factories = [
  {
    factory: "0x4412140D52C1F5834469a061927811Abb6026dB7",
    coinsAbi: 'function get_coins(address) view returns (address[])',
    swapEvent: 'event TokenExchange(address indexed buyer, int128 sold_id, uint256 tokens_sold, int128 bought_id, uint256 tokens_bought)',
  },
  {
    factory: "0xf0E48dC92f66E246244dd9F33b02f57b0E69fBa9",
    coinsAbi: 'function get_coins(address) view returns (address[2])',
    swapEvent: cryptoSwapEvent,
  },
  {
    factory: "0xebd098c60b1089f362AC9cfAd9134CBD29408226",
    coinsAbi: 'function get_coins(address) view returns (address[3])',
    swapEvent: cryptoSwapEvent,
  },
]

const fetch = async (
  { createBalances, chain, getLogs, api }: FetchOptions
): Promise<FetchResult> => {
  const dailyVolume = createBalances()

  for (const { factory, coinsAbi, swapEvent } of factories) {
    const pools = await api.fetchList({ lengthAbi: 'pool_count', itemAbi: 'pool_list', target: factory })
    if (!pools.length) continue
    const coins = await api.multiCall({ abi: coinsAbi, calls: pools, target: factory })
    const logs = await getLogs({ targets: pools, eventAbi: swapEvent, flatten: false })
    logs.forEach((poolLogs: any[], i: number) => {
      poolLogs.forEach((log: any) => {
        const token0 = coins[i][Number(log.sold_id)]
        const token1 = coins[i][Number(log.bought_id)]
        addOneToken({ chain, balances: dailyVolume, token0, amount0: log.tokens_sold, token1, amount1: log.tokens_bought })
      })
    })
  }

  return { dailyVolume }
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  adapter: {
    [CHAIN.FLOW]: {
      fetch,
    },
  },
};

export default adapter;
