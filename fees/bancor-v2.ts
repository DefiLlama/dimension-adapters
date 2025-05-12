import { FetchOptions } from "../adapters/types"
import { CHAIN } from "../helpers/chains"
import { filterPools2 } from "../helpers/uniswap"

async function fetch(fetchOptions: FetchOptions) {
  const { api, getLogs, createBalances, } = fetchOptions
  const converterRegistry = '0xC0205e203F423Bcd8B2a4d6f8C8A154b0Aa60F19'
  const smartTokens = await api.call({ abi: 'address[]:getLiquidityPools', target: converterRegistry })
  const pools = await api.call({ abi: "function getConvertersBySmartTokens(address[] _smartTokens) view returns (address[])", target: converterRegistry, params: [smartTokens] });
  const token1s = await api.multiCall({ abi: 'function connectorTokens(uint256) view returns (address)', calls: pools.map((i: any) => ({ target: i, params: [1] })) })
  const token0s = await api.multiCall({ abi: 'function connectorTokens(uint256) view returns (address)', calls: pools.map((i: any) => ({ target: i, params: [0] })) })
  const { pairs } = await filterPools2({ fetchOptions, pairs: pools, token0s, token1s, minUSDValue: 1e4, maxPairSize: 31 })
  const logs = await getLogs({ targets: pairs, eventAbi: 'event Conversion (address indexed sourceToken, address indexed targetToken, address indexed trader, uint256 sourceAmount, uint256 targetAmount, int256 conversionFee)' })
  const dailyFees = createBalances()
  logs.forEach((log: any) => dailyFees.add(log.targetToken, log.conversionFee))

  return { dailyFees }
}

export default {
  version: 2,
  adapter: {
    [CHAIN.ETHEREUM]: { fetch, start: '2020-06-20' },
  }
}