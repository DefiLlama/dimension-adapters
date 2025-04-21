import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";


const address: any = {
  [CHAIN.ARBITRUM]: "0xfA12DCB2e1FD72bD92E8255Db6A781b2c76adC20",
  [CHAIN.AVAX]: "0xfA12DCB2e1FD72bD92E8255Db6A781b2c76adC20"
}

const event = "event SwapExecuted(uint256 indexed nonceAndMeta,address taker,address destTrader,uint256 destChainId,address srcAsset,address destAsset,uint256 srcAmount,uint256 destAmount)"

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const logs = await options.getLogs({ target: address[options.chain], eventAbi: event })
  logs.forEach(log => {
    dailyVolume.add(log.destAsset, log.destAmount)
  })
  return { dailyVolume }
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch: fetch,
      start: '2024-09-30',
    },
    [CHAIN.AVAX]: {
      fetch: fetch,
      start: '2024-09-30',
    },
  },
};

export default adapter;