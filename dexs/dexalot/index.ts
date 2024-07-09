import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

interface IVolumeall {
  volumeusd: string;
  date: number;
}

const address: any = {
  [CHAIN.ARBITRUM]: "0x010224949cCa211Fb5dDfEDD28Dc8Bf9D2990368",
  [CHAIN.AVAX]: "0xEed3c159F3A96aB8d41c8B9cA49EE1e5071A7cdD"
}

const event = "event SwapExecuted(uint256 indexed nonceAndMeta,address taker,address destTrader,uint256 destChainId,address srcAsset,address destAsset,uint256 srcAmount,uint256 destAmount)"

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const logs = await options.getLogs({
    target: address[options.chain],
    eventAbi: event
  })
  logs.forEach(log => {
    dailyVolume.add(log.destAsset, log.destAmount)
  })
  return { dailyVolume }
};


const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.AVAX]: {
      fetch: fetch,
      start: 0,
    },
    [CHAIN.ARBITRUM]: {
      fetch: fetch,
      start: 0,
    },
  },
};

export default adapter;
