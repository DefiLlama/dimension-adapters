import { BreakdownAdapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { filterPools2 } from "../../helpers/uniswap";

const adapter: BreakdownAdapter = {
  version: 2,
  breakdown: {
    "v2.1": {
      [CHAIN.ETHEREUM]: {
        fetch: fetchV2,
        start: '2019-10-10',
      }
    },
    "v3": {
      [CHAIN.ETHEREUM]: {
        fetch: fetchV3,
      }
    }
  }
}
export default adapter;

async function fetchV2(fetchOptions: FetchOptions) {
  const { api, getLogs, createBalances, } = fetchOptions
  const converterRegistry = '0xC0205e203F423Bcd8B2a4d6f8C8A154b0Aa60F19'
  const smartTokens = await api.call({ abi: 'address[]:getLiquidityPools', target: converterRegistry })
  const pools = await api.call({ abi: "function getConvertersBySmartTokens(address[] _smartTokens) view returns (address[])", target: converterRegistry, params: [smartTokens] });
  const token1s = await api.multiCall({ abi: 'function connectorTokens(uint256) view returns (address)', calls: pools.map((i: any) => ({ target: i, params: [1] })) })
  const token0s = await api.multiCall({ abi: 'function connectorTokens(uint256) view returns (address)', calls: pools.map((i: any) => ({ target: i, params: [0] })) })
  const { pairs } = await filterPools2({ fetchOptions, pairs: pools, token0s, token1s, minUSDValue: 1e4, maxPairSize: 31 })
  const logs = await getLogs({ targets: pairs, eventAbi: 'event Conversion (address indexed sourceToken, address indexed targetToken, address indexed trader, uint256 sourceAmount, uint256 targetAmount, int256 conversionFee)' })
  const dailyVolume = createBalances()
  logs.forEach((log: any) => dailyVolume.add(log.targetToken, log.targetAmount))

  return { dailyVolume }
}
async function fetchV3(fetchOptions: FetchOptions) {
  const { getLogs, createBalances, } = fetchOptions
  const contract  = '0xeEF417e1D5CC832e619ae18D2F140De2999dD4fB'
  const dailyVolume = createBalances()
  const logs = await getLogs({ targets: [contract], eventAbi: 'event TokensTraded(bytes32 indexed contextId, address indexed sourceToken, address indexed targetToken, uint256 sourceAmount, uint256 targetAmount, uint256 bntAmount, uint256 targetFeeAmount, uint256 bntFeeAmount, address trader)' })
  logs.forEach((log: any) => dailyVolume.add(log.targetToken, log.targetAmount))
  return { dailyVolume }
}