import ADDRESSES from '../../helpers/coreAssets.json'
import { ChainBlocks, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { addTokensReceived } from "../../helpers/token";


const fetch = async (timestamp: number, _: ChainBlocks, options: FetchOptions) => {
  const tokens = [
    ADDRESSES.arbitrum.DAI,
    ADDRESSES.arbitrum.USDC,
    ADDRESSES.arbitrum.USDT,
    ADDRESSES.arbitrum.WBTC,
  ]
  const dailyVolume = await addTokensReceived({ tokens, options, fromAddressFilter: '0xC32eB36f886F638fffD836DF44C124074cFe3584' })
  return { timestamp, dailyVolume }
}


const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch,
      start: 1667260800,
    },
  }
};

export default adapter;
