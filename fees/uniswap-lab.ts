import ADDRESSES from '../helpers/coreAssets.json'
import { ChainBlocks, FetchOptions, FetchResultFees, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { addTokensReceived } from '../helpers/token';

const config: any = {
  ethereum: { tokens: [ADDRESSES.ethereum.USDC], targets: ['0x163c5e051049e92915017fe7bb9b8ce6182bcbb1', '0x6460d14dbaeb27aefec8ebef85db35defa31c3b9', '0x27213E28D7fDA5c57Fe9e5dD923818DBCcf71c47'] },
  optimism: { tokens: [ADDRESSES.optimism.USDC_CIRCLE], targets: ['0xd4ce1f1b8640c1988360a6729d9a73c85a0c80a3'] },
  polygon: { tokens: [ADDRESSES.polygon.USDC, ADDRESSES.polygon.USDC_CIRCLE], targets: ['0xce946931adf7afc0797de2a76270a28458f487ed'] },
  arbitrum: { tokens: [ADDRESSES.arbitrum.USDC_CIRCLE], targets: ['0xd4ce1f1b8640c1988360a6729d9a73c85a0c80a3'] },
}

const fetch = async (timestamp: number, _: ChainBlocks, options: FetchOptions): Promise<FetchResultFees> => {
  const dailyFees = await addTokensReceived({ ...config[options.chain], options})
  return { timestamp, dailyFees, dailyRevenue: dailyFees }
}

const adapters: SimpleAdapter = {
  adapter: {
    [CHAIN.ETHEREUM]: { fetch, start: 1696896000 },
    [CHAIN.OPTIMISM]: { fetch, start: 1696896000 },
    [CHAIN.POLYGON]: { fetch, start: 1696896000 },
    [CHAIN.ARBITRUM]: { fetch, start: 1696896000 }
  }
}
export default adapters;
