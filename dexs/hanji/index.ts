import BigNumber from "bignumber.js";
import { BaseAdapter, FetchOptions, SimpleAdapter } from "../../adapters/types"
import { CHAIN } from "../../helpers/chains";
import { addOneToken } from "../../helpers/prices"
import { formatUnits, parseUnits } from "ethers";

const createdLOBEventAbi = "event OnchainCLOBCreated(address indexed creator, address OnchainCLOB, address tokenXAddress, address tokenYAddress, bool supports_native_eth, uint256 scaling_token_x, uint256 scaling_token_y, address administrator, address marketmaker, address pauser, bool should_invoke_on_trade, uint64 admin_commission_rate, uint64 total_aggressive_commission_rate, uint64 total_passive_commission_rate, uint64 passive_order_payout)"
const placedOrderV1Abi = "event OrderPlaced(address indexed owner, uint64 order_id, bool indexed isAsk, uint128 quantity, uint72 price, uint128 passive_shares, uint128 passive_fee, uint128 aggressive_shares, uint128 aggressive_value, uint128 aggressive_fee, bool market_only, bool post_only)"
const placedOrderV2Abi = "event OrderPlaced(address indexed owner, address indexed initiator, uint64 order_id, bool indexed isAsk, uint128 quantity, uint72 price, uint128 passive_shares, uint128 passive_fee, uint128 aggressive_shares, uint128 aggressive_value, uint128 aggressive_fee, bool market_only, bool post_only)"
const getConfigAbi = "function getConfig() view returns (uint256 _scaling_factor_token_x, uint256 _scaling_factor_token_y, address _token_x, address _token_y, bool _supports_native_eth, bool _is_token_x_weth, address _ask_trie, address _bid_trie, uint64 _admin_commission_rate, uint64 _total_aggressive_commission_rate, uint64 _total_passive_commission_rate, uint64 _passive_order_payout_rate, bool _should_invoke_on_trade)"


const config: any = {
  [CHAIN.BASE]: { clobFactoryV1: [], clobFactoryV2: ['0xC7264dB7c78Dd418632B73A415595c7930A9EEA4'], fromBlock: 37860153 },
  [CHAIN.ETHERLINK]: { clobFactoryV1: ['0xfb2Ab9f52804DB8Ed602B95Adf0996aeC55ad6Df', '0x8f9949CF3B79bBc35842110892242737Ae11488F'], clobFactoryV2: [], fromBlock: 6610800 },
  // [CHAIN.MONAD]: { clobFactoryV1: [], clobFactoryV2: ['0x5C28a12C8EbAF8524A2Ba1fdc62565571Aec87f1'], fromBlock: 38411390 },
}

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {}
}

const getScalingFactorExponent = (scalingFactor: bigint): number => {
  let exponent = 0;
  while (scalingFactor > 1n) {
    scalingFactor /= 10n;
    exponent++;
  }
  return exponent;
};

async function fetch({ getLogs, createBalances, chain, fromApi, toApi, api }: FetchOptions) {
  const { clobFactoryV1, clobFactoryV2, fromBlock } = config[chain]
  const getFromBlock = Number(fromApi.block)
  const getToBlock = Number(toApi.block)
  const dailyVolume = createBalances()
  const dailyFees = createBalances()
  const dailyRevenue = createBalances()
  const dailyUserFees = createBalances()

  const factories = [...clobFactoryV1, ...clobFactoryV2]
  const lobCreatedLogs = await getLogs({
    targets: factories,
    fromBlock,
    skipIndexer: true,
    eventAbi: createdLOBEventAbi,
    onlyArgs: false,
  })

  const lobMap: Record<string, { 
    isV2: boolean,
    tokenXAddress: string,
    tokenXDecimals: number,
    tokenXScalingFactor: number,
    tokenYAddress: string,
    tokenYDecimals: number,
    tokenYScalingFactor: number,
    adminCommissionRate: number
  }> = {}

  for (const log of lobCreatedLogs) {
    const { OnchainCLOB, tokenXAddress, scaling_token_x, tokenYAddress, scaling_token_y } = log.args

    const lobConfig = await api.call({
      abi: getConfigAbi,
      target: OnchainCLOB,
      permitFailure: true,
    })

    const [tokenXDecimals, tokenYDecimals] = await api.multiCall({
      abi: 'erc20:decimals',
      calls: [tokenXAddress, tokenYAddress],
      permitFailure: true,
    })

    lobMap[OnchainCLOB.toLowerCase()] = { 
      isV2: clobFactoryV2.map(address => address.toLowerCase()).includes(log.address.toLowerCase()),
      tokenXAddress, 
      tokenXDecimals: Number(tokenXDecimals),
      tokenXScalingFactor: Number(tokenXDecimals) - getScalingFactorExponent(scaling_token_x),
      tokenYAddress,
      tokenYDecimals: Number(tokenYDecimals),
      tokenYScalingFactor: Number(tokenYDecimals) - getScalingFactorExponent(scaling_token_y),
      adminCommissionRate: Number(formatUnits(lobConfig._admin_commission_rate))
    }
  }

  console.log(lobMap)

  const v1LobAddresses = Object.entries(lobMap)
  .filter(([_, info]) => !info.isV2)
  .map(([address]) => address)

  const v2LobAddresses = Object.entries(lobMap)
    .filter(([_, info]) => info.isV2)
    .map(([address]) => address)

  const [v1OrderLogs, v2OrderLogs] = await Promise.all([
    v1LobAddresses.length > 0 ? getLogs({
      targets: v1LobAddresses,
      eventAbi: placedOrderV1Abi,
      fromBlock: getFromBlock,
      toBlock: getToBlock,
      onlyArgs: false,
      skipIndexer: true,
      flatten: true,
    }) : [],
    v2LobAddresses.length > 0 ? getLogs({
      targets: v2LobAddresses,
      eventAbi: placedOrderV2Abi,
      fromBlock: getFromBlock,
      toBlock: getToBlock,
      onlyArgs: false,
      skipIndexer: true,
      flatten: true,
    }) : []
  ])

  const allOrderLogs = [...v1OrderLogs, ...v2OrderLogs]

  allOrderLogs.forEach((log: any) => {
    const lobAddress = log.address?.toLowerCase()
    const lobInfo = lobMap[lobAddress]
    if (!lobInfo) return

    const { tokenXAddress, tokenXDecimals, tokenXScalingFactor, tokenYAddress, tokenYDecimals, tokenYScalingFactor } = lobInfo
    const { aggressive_shares, aggressive_fee, passive_fee } = log.args

    const tradeAmount = formatUnits(aggressive_shares, tokenXScalingFactor)
    const orderFee = formatUnits(aggressive_fee + passive_fee, tokenYScalingFactor)
    const adminFee = BigNumber(orderFee).times(lobInfo.adminCommissionRate).toFixed(tokenYDecimals)
    const userFee = BigNumber(orderFee).minus(adminFee).toFixed(tokenYDecimals)

    addOneToken({ chain, balances: dailyVolume, token0: tokenXAddress, amount0: parseUnits(tradeAmount, tokenXDecimals), token1: tokenXAddress, amount1: parseUnits(tradeAmount, tokenXDecimals) })
    addOneToken({ chain, balances: dailyFees, token0: tokenYAddress, amount0: parseUnits(orderFee, tokenYDecimals), token1: tokenYAddress, amount1: parseUnits(orderFee, tokenYDecimals) })
    addOneToken({ chain, balances: dailyRevenue, token0: tokenYAddress, amount0: parseUnits(adminFee.toString(), tokenYDecimals), token1: tokenYAddress, amount1: parseUnits(adminFee.toString(), tokenYDecimals) })
    addOneToken({ chain, balances: dailyUserFees, token0: tokenYAddress, amount0: parseUnits(userFee.toString(), tokenYDecimals), token1: tokenYAddress, amount1: parseUnits(userFee.toString(), tokenYDecimals) })
  })

  return { dailyVolume, dailyFees, dailyRevenue, dailyUserFees }
}

Object.keys(config).forEach(chain => {
  const { start } = config[chain];
  (adapter.adapter as BaseAdapter)[chain] = { fetch, start }
})

export default adapter
