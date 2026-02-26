import ADDRESSES from '../../helpers/coreAssets.json'
import { FetchOptions, SimpleAdapter } from "../../adapters/types"
import { CHAIN } from "../../helpers/chains"

const address = '0x5839389261D1F38aac7c8E91DcDa85646bEcB414'
const event_route = 'event Route(address indexed from,address to,address indexed tokenIn,address indexed tokenOut,uint256 amountIn,uint256 amountOutMin,uint256 amountOut)'

const tokenMapping = {
  [ADDRESSES.flow.stgUSDC]: {
    id:'usd-coin',
    decimals: 6
  },
  [ADDRESSES.GAS_TOKEN_2]: {
    id: 'ethereum',
    decimals: 18
  },
  '0x0200C29006150606B650577BBE7B6248F58470c1': {
    id: 'tether',
    decimals: 6
  },
  [ADDRESSES.optimism.WETH_1]: {
    id: 'ethereum',
    decimals: 18
  },
  "0xD642B49d10cc6e1BC1c6945725667c35e0875f22": {
    id: 'purple',
    decimals: 18
  },
  "0xbf0cAfCbaaF0be8221Ae8d630500984eDC908861": {
    id: 'squidswap',
    decimals: 18
  },
  '0xCa5f2cCBD9C40b32657dF57c716De44237f80F05': {
    id: 'kraken-ink',
    decimals: 18
  },
  "0x0c5E2D1C98cd265C751e02F8F3293bC5764F9111": {
    id: 'shroomy',
    decimals: 18
  },
  '0xCb95A3840c8eA5F0D4E78B67eC897Df84d17c5e6': {
    id: 'kraken-ink',
    decimals: 18
  }
}
const fetchVolume = async (options: FetchOptions) => {
  const logs = await options.getLogs({
    target: address,
    eventAbi: event_route,
  })
  const dailyVolume = options.createBalances()
  logs.forEach(log => {
    if (tokenMapping[log.tokenOut]) {
      dailyVolume.addCGToken(
        tokenMapping[log.tokenOut].id,
        Number(log.amountOut) / 10 ** tokenMapping[log.tokenOut].decimals,
      )
    } else if (tokenMapping[log.tokenIn]) {
      dailyVolume.addCGToken(
        tokenMapping[log.tokenIn].id,
        Number(log.amountIn) / 10 ** tokenMapping[log.tokenIn].decimals,
      )
    }
  })
  return {
    dailyVolume: dailyVolume
  }
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  adapter: {
    [CHAIN.INK]: {
      fetch: fetchVolume,
      start: '2025-01-07',
    },
  },
}

export default adapter;
