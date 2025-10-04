import ADDRESSES from '../helpers/coreAssets.json'
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { addTokensReceived } from '../helpers/token';

const config: any = {
  ethereum: { tokens: [ADDRESSES.ethereum.USDC], targets: ['0x163c5e051049e92915017fe7bb9b8ce6182bcbb1', '0x6460d14dbaeb27aefec8ebef85db35defa31c3b9', '0x27213E28D7fDA5c57Fe9e5dD923818DBCcf71c47'] },
  optimism: { tokens: [ADDRESSES.optimism.USDC_CIRCLE], targets: ['0xd4ce1f1b8640c1988360a6729d9a73c85a0c80a3', '0x7ffc3dbf3b2b50ff3a1d5523bc24bb5043837b14'] },
  polygon: { tokens: [ADDRESSES.polygon.USDC, ADDRESSES.polygon.USDC_CIRCLE], targets: ['0xce946931adf7afc0797de2a76270a28458f487ed', '0x7ffc3dbf3b2b50ff3a1d5523bc24bb5043837b14'] },
  arbitrum: { tokens: [ADDRESSES.arbitrum.USDC_CIRCLE], targets: ['0xd4ce1f1b8640c1988360a6729d9a73c85a0c80a3', '0x7ffc3dbf3b2b50ff3a1d5523bc24bb5043837b14'] },
  base: { tokens: [ADDRESSES.base.USDC], targets: ["0x7ffc3dbf3b2b50ff3a1d5523bc24bb5043837b14"] },
  bsc: { tokens: [ADDRESSES.bsc.USDC], targets: ["0x7ffc3dbf3b2b50ff3a1d5523bc24bb5043837b14"] },
  avax: { tokens: [ADDRESSES.avax.USDC], targets: ["0x7ffc3dbf3b2b50ff3a1d5523bc24bb5043837b14"] },
}

const fetch = async (options: FetchOptions) => {
  const dailyFees = await addTokensReceived({ ...config[options.chain], options })

  return { dailyFees, dailyUserFees: dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyFees }
}

const adapters: SimpleAdapter = {
  adapter: Object.keys(config).reduce((all, chain) => ({
    ...all,
    [chain]: {
      fetch,
      start: '2023-10-10',
    }
  }), {}),
  version: 2,
  methodology: {
    Fees: "All trading fees paid by users while using Uniswap frontend.",
    UserFees: "All trading fees paid by users while using Uniswap frontend.",
    Revenue: "Trading fees are collected by Uniswap Labs.",
    ProtocolRevenue: "Trading fees are collected by Uniswap Labs.",
  },
}
export default adapters;
