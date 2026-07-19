import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { addTokensReceived } from "../../helpers/token";
import { getUniV2LogAdapter, getUniV3LogAdapter } from "../../helpers/uniswap";
import { addOneToken } from "../../helpers/prices";

interface ChainConfig {
  AQUILA_V2_FACTORY: string
  CLMM_V3_FACTORY: string
  CLMM_V3_START_BLOCK: number
  GLADIUS_REACTORS: string[]
  AQUILAL_REVENUE_RATIO: number
  start: string
  CLASSIC_MARKET?: string
}

// Address source: docs.rubicon.finance/developers/deployments
const chainConfig: Record<string, ChainConfig> = {
  [CHAIN.ETHEREUM]: {
    AQUILA_V2_FACTORY: '0x7bad585c3ae4ae266f92a4af13b388bc7b26067c',
    CLMM_V3_FACTORY: '0xDf62D9e51d7c08360dcd41931A2e6B97FF8C73E8',
    CLMM_V3_START_BLOCK: 24780521,
    GLADIUS_REACTORS: ['0x3C53c04d633bec3fB0De3492607C239BF92d07f9', '0xF08DB8D79312ce610aEED9463EdE1A6BB8aE4235'],
    AQUILAL_REVENUE_RATIO: 0,
    start: '2024-03-04',
  },
  [CHAIN.OPTIMISM]: {
    AQUILA_V2_FACTORY: '0x3B2C6fe3039B42f00E98b76531C05932abfB258e',
    CLMM_V3_FACTORY: '0x53f64267EDE764C53ABEbCc768aD7A96c6006D8a',
    CLMM_V3_START_BLOCK: 149697019,
    GLADIUS_REACTORS: ['0x98169248bdf25e0e297ea478ab46ac24058fac78', '0x95b7F3662Ba73b3fF35874Af0E09b050dB03118B'],
    AQUILAL_REVENUE_RATIO: 1 / 6,
    CLASSIC_MARKET: '0x7a512d3609211e719737E82c7bb7271eC05Da70d',
    start: '2021-11-11',
  },
  [CHAIN.ARBITRUM]: {
    AQUILA_V2_FACTORY: '0xEca3EA559b7566e610d113bbA8D1B15B085C9c68',
    CLMM_V3_FACTORY: '0x045B7012CbD158C1b48874310F985Adb48aA62ba',
    CLMM_V3_START_BLOCK: 447703806,
    GLADIUS_REACTORS: ['0x6d81571b4c75ccf08bd16032d0ae54dbaff548b0'],
    AQUILAL_REVENUE_RATIO: 1 / 6,
    CLASSIC_MARKET: '0xC715a30FDe987637A082Cf5F19C74648b67f2db8',
    start: '2023-06-09',
  },
  [CHAIN.BASE]: {
    AQUILA_V2_FACTORY: '0xA5cA8Ba2e3017E9aF3Bd9EDa69e9E8C263Abf6cD',
    CLMM_V3_FACTORY: '0xB5E5A9e628FEF819150A6E5127aB481cee5d6Ca9',
    CLMM_V3_START_BLOCK: 44100001,
    GLADIUS_REACTORS: ['0x3c53c04d633bec3fb0de3492607c239bf92d07f9'],
    AQUILAL_REVENUE_RATIO: 1 / 6,
    CLASSIC_MARKET: '0x9A5215E96E1185d4e6002C95C3Cc0aB6eEaD354F',
    start: '2023-08-08',
  },
}

const CLASSIC_LOGTAKE_ABI = 'event LogTake(bytes32 id, bytes32 indexed pair, address indexed maker, address pay_gem, address buy_gem, address indexed taker, uint128 take_amt, uint128 give_amt, uint64 timestamp)'
const CLASSIC_EMITTAKE_ABI = 'event emitTake(bytes32 indexed id, bytes32 indexed pair, address indexed maker, address taker, address pay_gem, address buy_gem, uint128 take_amt, uint128 give_amt)'
const GLADIUS_FILL_ABI = 'event Fill(bytes32 indexed orderHash, address indexed filler, address indexed swapper, uint256 nonce)'
const POOL_CREATED_ABI = 'event PoolCreated (address indexed token0,address indexed token1,uint24 indexed fee, int24 tickSpacing, address pool)'

const CLASSIC_FEE_BPS = 2
const CLASSIC_FEE_RATE = CLASSIC_FEE_BPS / 10_000 // 0.0002
const RUBICON_FEE_WALLET = '0x752748deaf25cf58b60d4c4209d7f200aee4ef14'

const LBL_AQUILA = 'Aquila V2'
const LBL_CLMM = 'CLMM V3'
const LBL_CLASSIC = 'Classic'
const LBL_GLADIUS = 'Gladius'

const fetch = async (options: FetchOptions) => {
  const chain = options.chain
  const dailyVolume = options.createBalances()
  const dailyFees = options.createBalances()
  const dailyRevenue = options.createBalances()
  const dailyProtocolRevenue = options.createBalances()
  const dailySupplySideRevenue = options.createBalances()

  const { AQUILA_V2_FACTORY, CLMM_V3_FACTORY, CLMM_V3_START_BLOCK, GLADIUS_REACTORS, AQUILAL_REVENUE_RATIO } = chainConfig[chain]

  if (AQUILA_V2_FACTORY) {
    const revenueRatio = AQUILAL_REVENUE_RATIO ?? 0
    const aquilaFetch = getUniV2LogAdapter({
      factory: AQUILA_V2_FACTORY,
      fees: 0.003,
      userFeesRatio: 1,
      revenueRatio,
      protocolRevenueRatio: revenueRatio,
      allowReadPairs: true,
    })
    const aq = await aquilaFetch(options)
    if (aq?.dailyVolume) dailyVolume.addBalances(aq.dailyVolume)
    if (aq?.dailyFees) dailyFees.addBalances(aq.dailyFees, LBL_AQUILA)
    if (aq?.dailyRevenue) dailyRevenue.addBalances(aq.dailyRevenue, LBL_AQUILA)
    if (aq?.dailyProtocolRevenue) dailyProtocolRevenue.addBalances(aq.dailyProtocolRevenue, LBL_AQUILA)
    if (aq?.dailySupplySideRevenue) dailySupplySideRevenue.addBalances(aq.dailySupplySideRevenue, LBL_AQUILA)
  }

  if (CLMM_V3_FACTORY) {
    const poolCreatedLogs = await options.getLogs({
      target: CLMM_V3_FACTORY,
      eventAbi: POOL_CREATED_ABI,
      fromBlock: CLMM_V3_START_BLOCK,
      cacheInCloud: true,
    })
    const pools = poolCreatedLogs.map((log: any) => log.pool)
    const clData = await getUniV3LogAdapter({
      pools,
      userFeesRatio: 1,
      revenueRatio: 0,
      protocolRevenueRatio: 0,
    })(options)

    if (clData?.dailyVolume) dailyVolume.addBalances(clData.dailyVolume)
    if (clData?.dailyFees) dailyFees.addBalances(clData.dailyFees, LBL_CLMM)
    if (clData?.dailySupplySideRevenue) dailySupplySideRevenue.addBalances(clData.dailySupplySideRevenue, LBL_CLMM)
  }

  if (chainConfig[chain].CLASSIC_MARKET) {
    const logs = [
      ...await options.getLogs({
        target: chainConfig[chain].CLASSIC_MARKET,
        eventAbi: CLASSIC_LOGTAKE_ABI,
      }),
      ...await options.getLogs({
        target: chainConfig[chain].CLASSIC_MARKET,
        eventAbi: CLASSIC_EMITTAKE_ABI,
      }),
    ]
    const classicVol = options.createBalances()
    const classicFees = options.createBalances()
    logs.forEach((log: any) => {
      addOneToken({ chain, balances: classicVol, token0: log.pay_gem, token1: log.buy_gem, amount0: log.take_amt, amount1: log.give_amt })
      addOneToken({ chain, balances: classicFees, token0: log.pay_gem, token1: log.buy_gem, amount0: Number(log.take_amt) * CLASSIC_FEE_RATE, amount1: Number(log.give_amt) * CLASSIC_FEE_RATE })
    })
    dailyVolume.addBalances(classicVol, LBL_CLASSIC)
    dailyFees.addBalances(classicFees, LBL_CLASSIC)
    dailyRevenue.addBalances(classicFees, LBL_CLASSIC)
    dailyProtocolRevenue.addBalances(classicFees, LBL_CLASSIC)
  }

  if (GLADIUS_REACTORS) {
    const fills = await options.getLogs({
      targets: GLADIUS_REACTORS,
      eventAbi: GLADIUS_FILL_ABI,
    })
    const fillers = new Set<string>()
    const swappers = new Set<string>()
    fills.forEach((f: any) => { fillers.add(f.filler); swappers.add(f.swapper) })
    if (fillers.size > 0 && swappers.size > 0) {
      const gladiusVolume = await addTokensReceived({
        options,
        targets: Array.from(swappers),
        fromAdddesses: Array.from(fillers),
      })
      dailyVolume.addBalances(gladiusVolume)
    }

    const gladiusFees = await addTokensReceived({
      options,
      target: RUBICON_FEE_WALLET,
      fromAdddesses: [...fillers],
    })
    if (gladiusFees) {
      dailyFees.addBalances(gladiusFees, LBL_GLADIUS)
      dailyRevenue.addBalances(gladiusFees, LBL_GLADIUS)
      dailyProtocolRevenue.addBalances(gladiusFees, LBL_GLADIUS)
    }
  }

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue,
    dailySupplySideRevenue,
    dailyUserFees: dailyFees,
  }
}

const methodology = {
  UserFees: 'Identical to Fees — every fee is paid by the trader/taker.',
  Volume:
    'Total daily trading volume across Rubicon\'s four systems: Aquila V2 (UniV2-fork ' +
    'AMM, Swap events on pairs), CLMM V3 (UniV3-fork concentrated liquidity, Swap events ' +
    'on pools), Classic (RubiconMarket order book, LogTake/emitTake events; currently dormant), ' +
    'and Gladius (UniswapX-fork RFQ reactor, Fill events resolved to filler→swapper ERC20 ' +
    'transfers).',
  Fees:
    'Total user-paid trading fees across all four systems: Aquila V2 = 30 bps × swap ' +
    'notional, CLMM V3 = per-pool tier (5/30/100 bps) × swap notional, Classic = ' +
    '2 bps × take-event notional.',
  Revenue:
    'Protocol cut: Aquila V2 ~5 bps (1/6 of LP fee) on OP/Arb/Base where factory.feeTo ' +
    'is set, 0 on mainnet; CLMM V3 0 by default (factory.setFeeProtocol not enabled); ' +
    'Classic 100% of the 2 bps taker fee.',
  ProtocolRevenue: 'Identical to Revenue — Rubicon does not currently route fees to a holders/buyback bucket.',
  SupplySideRevenue:
    'LP cut: dailyFees minus protocol Revenue. Aquila ~25 bps to LPs (OP/Arb/Base) or ' +
    '30 bps (mainnet, fee switch off). CLMM 100% of pool tier to LPs. Classic and Gladius ' +
    'have no LP layer.',
}

const breakdownMethodology = {
  Fees: {
    [LBL_AQUILA]: '30 bps × swap notional on every Aquila pair.',
    [LBL_CLMM]: 'Per-pool tier (5/30/100 bps) × swap notional.',
    [LBL_CLASSIC]: '2 bps × take-event notional (getFeeBPS() = 2, re-verified 2026-07-09).',
    [LBL_GLADIUS]: '2 bps × take-event notional.',
  },
  Revenue: {
    [LBL_AQUILA]: '~5 bps (1/6 of LP fee) on OP/Arb/Base; 0 on mainnet.',
    [LBL_CLASSIC]: '100% of the 2 bps taker fee.',
    [LBL_GLADIUS]: '100% of the 2 bps taker fee.',
  },
  ProtocolRevenue: {
    [LBL_AQUILA]: '~5 bps (1/6 of LP fee) on OP/Arb/Base; 0 on mainnet.',
    [LBL_CLASSIC]: '100% of the 2 bps taker fee.',
    [LBL_GLADIUS]: '100% of the 2 bps taker fee.',
  },
  SupplySideRevenue: {
    [LBL_AQUILA]: '~25 bps on OP/Arb/Base; 30 bps on mainnet (fee switch off).',
    [LBL_CLMM]: '100% of per-pool fee tier.',
  },
}

const adapter: Adapter = {
  version: 2,
  pullHourly: true,
  fetch,
  methodology,
  breakdownMethodology,
  adapter: chainConfig
}

export default adapter
