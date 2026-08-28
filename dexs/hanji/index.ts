import BigNumber from "bignumber.js";
import { FetchOptions, SimpleAdapter } from "../../adapters/types"
import { CHAIN } from "../../helpers/chains";
import { formatUnits, parseUnits } from "ethers";

const createdLOBEventAbi = "event OnchainCLOBCreated(address indexed creator, address OnchainCLOB, address tokenXAddress, address tokenYAddress, bool supports_native_eth, uint256 scaling_token_x, uint256 scaling_token_y, address administrator, address marketmaker, address pauser, bool should_invoke_on_trade, uint64 admin_commission_rate, uint64 total_aggressive_commission_rate, uint64 total_passive_commission_rate, uint64 passive_order_payout)"
const placedOrderV1Abi = "event OrderPlaced(address indexed owner, uint64 order_id, bool indexed isAsk, uint128 quantity, uint72 price, uint128 passive_shares, uint128 passive_fee, uint128 aggressive_shares, uint128 aggressive_value, uint128 aggressive_fee, bool market_only, bool post_only)"
const placedOrderV2Abi = "event OrderPlaced(address indexed owner, address indexed initiator, uint64 order_id, bool indexed isAsk, uint128 quantity, uint72 price, uint128 passive_shares, uint128 passive_fee, uint128 aggressive_shares, uint128 aggressive_value, uint128 aggressive_fee, bool market_only, bool post_only)"
const getConfigAbi = "function getConfig() view returns (uint256 _scaling_factor_token_x, uint256 _scaling_factor_token_y, address _token_x, address _token_y, bool _supports_native_eth, bool _is_token_x_weth, address _ask_trie, address _bid_trie, uint64 _admin_commission_rate, uint64 _total_aggressive_commission_rate, uint64 _total_passive_commission_rate, uint64 _passive_order_payout_rate, bool _should_invoke_on_trade)"


const config: any = {
  [CHAIN.BASE]: { clobFactoryV1: [], clobFactoryV2: ['0xC7264dB7c78Dd418632B73A415595c7930A9EEA4'], fromBlock: 37860153, start: '2025-11-08' },
  [CHAIN.ETHERLINK]: { clobFactoryV1: ['0xfb2Ab9f52804DB8Ed602B95Adf0996aeC55ad6Df', '0x8f9949CF3B79bBc35842110892242737Ae11488F'], clobFactoryV2: ['0x6d420082D455BAb7B71EE3f00502882C27c77eB7'], fromBlock: 6610800, start: '2025-02-21' },
  [CHAIN.MONAD]: { clobFactoryV1: [], clobFactoryV2: ['0x5C28a12C8EbAF8524A2Ba1fdc62565571Aec87f1'], fromBlock: 38411390, start: '2025-11-28' },
}

const METRIC = {
  TAKER_FEES: "Taker Fees",
  MAKER_FEES: "Maker Fees",
  PASSIVE_ORDER_PAYOUT: "Passive Order Payout",
  MARKETMAKER_COMMISSION: "Marketmaker Commission",
  ADMINISTRATOR_COMMISSION: "Administrator Commission",
};

const getScalingFactorExponent = (scalingFactor: bigint): number => {
  let exponent = 0;
  while (scalingFactor > 1n) {
    scalingFactor /= 10n;
    exponent++;
  }
  return exponent;
};

async function fetch({ getLogs, createBalances, chain, fromApi, toApi, api }: FetchOptions) {
  const dailyVolume = createBalances()
  const dailyFees = createBalances()
  const dailyRevenue = createBalances()
  const dailyProtocolRevenue = createBalances()
  const dailySupplySideRevenue = createBalances()
  const dailyUserFees = createBalances()

  const { clobFactoryV1, clobFactoryV2, fromBlock } = config[chain]

  const factories = [...clobFactoryV1, ...clobFactoryV2]
  const lobCreatedLogs = await getLogs({
    targets: factories,
    fromBlock,
    eventAbi: createdLOBEventAbi,
    onlyArgs: false,
    cacheInCloud: true,
  })

  const lobMap: Record<string, {
    isV2: boolean,
    tokenXAddress: string,
    tokenXDecimals: number,
    tokenXScalingFactor: number,
    tokenYAddress: string,
    tokenYDecimals: number,
    tokenYScalingFactor: number,
    // 1e18-scale rates from getConfig(): admin gets adminRate of commission, marketmaker gets the rest.
    adminRate: string,
    aggressiveRate: string,
    payoutRate: string,
    // marketmaker's share is supply-side only if it's a distinct LP contract, not the administrator itself.
    marketmakerIsExternal: boolean,
  }> = {}

  const lobConfigs = await api.multiCall({
    abi: getConfigAbi,
    calls: lobCreatedLogs.map((i: any) => i.args.OnchainCLOB),
    permitFailure: true,
  });
  const tokenXDecimals = await api.multiCall({
    abi: 'uint8:decimals',
    calls: lobCreatedLogs.map((i: any) => i.args.tokenXAddress),
    permitFailure: true,
  });
  const tokenYDecimals = await api.multiCall({
    abi: 'uint8:decimals',
    calls: lobCreatedLogs.map((i: any) => i.args.tokenYAddress),
    permitFailure: true,
  });

  for (let i = 0; i < lobCreatedLogs.length; i++) {
    const lobConfig = lobConfigs[i];
    const tokenXDecimal = Number(tokenXDecimals[i])
    const tokenYDecimal = Number(tokenYDecimals[i])

    const { OnchainCLOB, tokenXAddress, scaling_token_x, tokenYAddress, scaling_token_y, administrator, marketmaker } = lobCreatedLogs[i].args

    lobMap[OnchainCLOB.toLowerCase()] = {
      isV2: clobFactoryV2.map((address: string) => address.toLowerCase()).includes(lobCreatedLogs[i].address.toLowerCase()),
      tokenXAddress,
      tokenXDecimals: Number(tokenXDecimal),
      tokenXScalingFactor: Number(tokenXDecimal) - getScalingFactorExponent(scaling_token_x),
      tokenYAddress,
      tokenYDecimals: Number(tokenYDecimal),
      tokenYScalingFactor: Number(tokenYDecimal) - getScalingFactorExponent(scaling_token_y),
      adminRate: formatUnits(lobConfig._admin_commission_rate),
      aggressiveRate: lobConfig._total_aggressive_commission_rate.toString(),
      payoutRate: lobConfig._passive_order_payout_rate.toString(),
      marketmakerIsExternal: administrator.toLowerCase() !== marketmaker.toLowerCase(),
    }
  }

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
      onlyArgs: false,
      flatten: true,
    }) : [],
    v2LobAddresses.length > 0 ? getLogs({
      targets: v2LobAddresses,
      eventAbi: placedOrderV2Abi,
      onlyArgs: false,
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
    // aggressive_fee bundles a payout slice for filled passive orders; passive_fee is a maker commission.
    const aggressiveFee = BigNumber(formatUnits(aggressive_fee, tokenYScalingFactor))
    const passiveFee = BigNumber(formatUnits(passive_fee, tokenYScalingFactor))

    // Split aggressive_fee by its on-chain rate composition to isolate the LP payout.
    const rateDenom = BigNumber(lobInfo.aggressiveRate).plus(lobInfo.payoutRate)
    const lpPayout = rateDenom.gt(0)
      ? aggressiveFee.times(lobInfo.payoutRate).div(rateDenom)
      : BigNumber(0)

    const commission = aggressiveFee.minus(lpPayout).plus(passiveFee)
    const marketmakerShare = lobInfo.marketmakerIsExternal
      ? commission.times(BigNumber(1).minus(lobInfo.adminRate))
      : BigNumber(0)
    const protocolFee = commission.minus(marketmakerShare)

    dailyVolume.add(tokenXAddress, parseUnits(tradeAmount, tokenXDecimals))
    dailyFees.add(tokenYAddress, parseUnits(aggressiveFee.toFixed(tokenYDecimals), tokenYDecimals), METRIC.TAKER_FEES)
    dailyFees.add(tokenYAddress, parseUnits(passiveFee.toFixed(tokenYDecimals), tokenYDecimals), METRIC.MAKER_FEES)
    dailyUserFees.add(tokenYAddress, parseUnits(aggressiveFee.toFixed(tokenYDecimals), tokenYDecimals), METRIC.TAKER_FEES)
    dailyUserFees.add(tokenYAddress, parseUnits(passiveFee.toFixed(tokenYDecimals), tokenYDecimals), METRIC.MAKER_FEES)
    dailyRevenue.add(tokenYAddress, parseUnits(protocolFee.toFixed(tokenYDecimals), tokenYDecimals), METRIC.ADMINISTRATOR_COMMISSION)
    dailyProtocolRevenue.add(tokenYAddress, parseUnits(protocolFee.toFixed(tokenYDecimals), tokenYDecimals), METRIC.ADMINISTRATOR_COMMISSION)
    if (lpPayout.gt(0)) {
      dailySupplySideRevenue.add(tokenYAddress, parseUnits(lpPayout.toFixed(tokenYDecimals), tokenYDecimals), METRIC.PASSIVE_ORDER_PAYOUT)
    }
    if (marketmakerShare.gt(0)) {
      dailySupplySideRevenue.add(tokenYAddress, parseUnits(marketmakerShare.toFixed(tokenYDecimals), tokenYDecimals), METRIC.MARKETMAKER_COMMISSION)
    }
  })

  return { dailyVolume, dailyFees, dailyRevenue, dailyProtocolRevenue, dailySupplySideRevenue, dailyUserFees }
}

const methodology = {
  Volume: "Taker volume in tokenX at the time each order is matched",
  Fees: "Taker fee on aggressive orders plus maker commission on resting orders, in tokenY",
  UserFees: "Same as Fees — all commissions are paid by the trader placing the order",
  SupplySideRevenue: "passive_order_payout slice of taker fees routed to filled makers, plus the marketmaker's commission share when the marketmaker is a distinct LP contract. Zero today: all markets have payout disabled and the marketmaker is the administrator itself",
  ProtocolRevenue: "admin_commission_rate share of commission, plus the marketmaker's share when the marketmaker equals the administrator",
  Revenue: "admin_commission_rate share of commission, plus the marketmaker's share when the marketmaker equals the administrator",
}

const breakdownMethodology = {
  Fees: {
    [METRIC.TAKER_FEES]: "aggressive_fee charged on the taker side of each matched order, in tokenY",
    [METRIC.MAKER_FEES]: "passive_fee charged on resting maker orders, in tokenY",
  },
  UserFees: {
    [METRIC.TAKER_FEES]: "aggressive_fee charged on the taker side of each matched order, in tokenY",
    [METRIC.MAKER_FEES]: "passive_fee charged on resting maker orders, in tokenY",
  },
  SupplySideRevenue: {
    [METRIC.PASSIVE_ORDER_PAYOUT]: "passive_order_payout_rate slice of aggressive_fee routed to filled passive makers",
    [METRIC.MARKETMAKER_COMMISSION]: "marketmaker's share of commission when the marketmaker is a distinct LP contract (1 - admin_commission_rate of commission)",
  },
  ProtocolRevenue: {
    [METRIC.ADMINISTRATOR_COMMISSION]: "admin_commission_rate share of commission, plus the marketmaker's share when the marketmaker equals the administrator",
  },
  Revenue: {
    [METRIC.ADMINISTRATOR_COMMISSION]: "admin_commission_rate share of commission, plus the marketmaker's share when the marketmaker equals the administrator",
  },
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  adapter: config,
  methodology,
  breakdownMethodology,
}

export default adapter
