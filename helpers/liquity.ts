import { BaseAdapter, FetchV2, IJSON, SimpleAdapter } from "../adapters/types";
import { createFactoryExports } from "../factory/registry";
import { CHAIN } from "./chains";
import { addTokensReceived, nullAddress } from "./token";
import { METRIC } from "./metrics";

export const METRICS = {
  GasCompensation: 'Gas Compensation',
  RedemptionFee: 'Redemption Fees',
  BorrowFees: 'Borrow Fees',
  BorrowInterestToStabilityPools: 'Borrow Interest To Stability Pools',
  RedemptionFeeToBorrowers: 'Redemtion Fee To Borrowers',
  LiquidationProfit: 'Liquidation Profit',
  ProtocolIncentivizedLiquidity: 'Protocol Incentivized Liquidity',
}

export const getLiquityV2LogAdapter: any = ({
  collateralRegistry,
  stableTokenAbi = 'address:boldToken', // default to stableCoin
  stabilityPoolRatio,
  revenueRatio,
}: LiquityV2Config): FetchV2 => {
  const fetch: FetchV2 = async (fetchOptions) => {
    const { createBalances, getLogs, api } = fetchOptions

    const dailyFees = createBalances()
    const dailyRevenue = createBalances()
    const dailySupplySideRevenue = createBalances()
    
    const troves = await api.fetchList({ lengthAbi: 'totalCollaterals', itemAbi: 'getTroveManager', target: collateralRegistry })
    const activePools = await api.multiCall({ abi: 'address:activePool', calls: troves })
    const stableCoin = await api.call({ abi: stableTokenAbi, target: collateralRegistry })
    const tokens = await api.multiCall({ abi: 'address:collToken', calls: activePools })
    let interestRouters = await api.multiCall({ abi: 'address:interestRouter', calls: activePools, permitFailure: true })
    let nullInterestRouterFound = interestRouters.some(i => !i)
    if (nullInterestRouterFound) {
      api.log('sometimes interestRouter is found in address registry, trying to fetch from there')
      const addressesRegistries = await api.multiCall({ abi: 'address:addressesRegistry', calls: activePools })
      interestRouters = await api.multiCall({ abi: 'address:interestRouter', calls: addressesRegistries, })
    }
    const stabilityPools = await api.multiCall({ abi: 'address:stabilityPool', calls: activePools })
    interestRouters = [...new Set(interestRouters.map(i => i.toLowerCase()))]

    const borrowInterest = await addTokensReceived({ options: fetchOptions, targets: stabilityPools.concat(interestRouters), tokens: [stableCoin], fromAdddesses: [nullAddress] })
    
    dailyFees.add(borrowInterest, METRIC.BORROW_INTEREST)
    
    // share of borrow interest to stability pools
    dailySupplySideRevenue.add(borrowInterest.clone(stabilityPoolRatio), METRICS.BorrowInterestToStabilityPools)
    
    // share of borrow interest to Protocol Incentivized Liquidity
    if (revenueRatio && revenueRatio > 0) {
      dailyRevenue.add(borrowInterest.clone(revenueRatio), METRICS.ProtocolIncentivizedLiquidity)
    }

    const redemptionLogs = await getLogs({
      targets: troves,
      eventAbi: 'event RedemptionFeePaidToTrove(uint256 indexed _troveId, uint256 _ETHFee)',
      flatten: false,
    })
    const liquidationLogs = await getLogs({
      targets: troves,
      eventAbi: 'event Liquidation(uint256 _debtOffsetBySP, uint256 _debtRedistributed, uint256 _boldGasCompensation, uint256 _collGasCompensation, uint256 _collSentToSP, uint256 _collRedistributed, uint256 _collSurplus, uint256 _L_ETH, uint256 _L_boldDebt, uint256 _price)',
      flatten: false,
    })

    redemptionLogs.forEach((logs, i) => {
      const collateralToken = tokens[i]
      logs.forEach((log: any) => {
        dailyFees.add(collateralToken, log._ETHFee, METRICS.RedemptionFee)
        
        // v2 redemption fees are distributed to borrowers
        dailySupplySideRevenue.add(collateralToken, log._ETHFee, METRICS.RedemptionFeeToBorrowers)
      })
    })

    liquidationLogs.forEach((logs, i) => {
      const collateralToken = tokens[i]
      logs.forEach((log: any) => {
        dailyFees.add(collateralToken, log._collGasCompensation, METRICS.GasCompensation)
        dailyFees.add(stableCoin, log._boldGasCompensation, METRICS.GasCompensation)
        dailySupplySideRevenue.add(collateralToken, log._collGasCompensation, METRICS.GasCompensation)
        dailySupplySideRevenue.add(stableCoin, log._boldGasCompensation, METRICS.GasCompensation)
      })
    })


    return { dailyFees, dailyRevenue, dailySupplySideRevenue  }
  }
  return fetch
}

type LiquityV2Config = {
  collateralRegistry: string,
  stableTokenAbi?: string,
  
  // borrow interests are share to stability pool and Protocol Incentivized Liquidity
  stabilityPoolRatio?: number;
  revenueRatio?: number;
  start?: string | number;
}


export const defaultV2methodology = {
  Fees: 'Total interest, redemption fees paid by borrowers and liquidation profit',
  Revenue: 'Share of borrow interest to protocol if any',
  SupplySideRevenue: 'Share of interest to stability pools takers, redemption fees paid by borrowers and liquidation profit',
}

export const defaultV2BreakdownMethodology = {
  Fees: {
    [METRIC.BORROW_INTEREST]: 'Borrow interests paid by borrowers.',
    [METRICS.RedemptionFee]: 'Redemption fees paid by borrowers.',
    [METRICS.GasCompensation]: 'Gas compensations paid to liquidator when trigger liquidations.',
  },
  Revenue: {
    [METRIC.BORROW_INTEREST]: 'Share of borrow interests paid by borrowers.',
  },
  SupplySideRevenue: {
    [METRICS.BorrowInterestToStabilityPools]: 'Share of borrow interest to stability pools stakers.',
    [METRICS.RedemptionFeeToBorrowers]: 'All redemtion fees are distributed to borrowers.',
    [METRICS.GasCompensation]: 'Gas compensations paid to liquidator when trigger liquidations.',
  },
}

export function liquityV2Exports(config: IJSON<LiquityV2Config>) {
  const exportObject: BaseAdapter = {}
  Object.entries(config).map(([chain, chainConfig]) => {
    exportObject[chain] = {
      fetch: getLiquityV2LogAdapter(chainConfig),
      start: chainConfig.start,
    }
  })
  return { adapter: exportObject, version: 2, methodology: defaultV2methodology, breakdownMethodology: defaultV2BreakdownMethodology, pullHourly: true, } as SimpleAdapter
}

const RedemptionEvent = 'event Redemption(uint _attemptedLUSDAmount, uint _actualLUSDAmount, uint _ETHSent, uint _ETHFee)'
const BorrowingEvent = 'event LUSDBorrowingFeePaid(address indexed _borrower, uint _LUSDFee)'
const LiquidationEvent = 'event Liquidation(uint _liquidatedDebt, uint _liquidatedColl, uint _collGasCompensation, uint _LUSDGasCompensation)'
const ETHGainWithdrawn = 'event ETHGainWithdrawn (address indexed _depositor, uint256 _ETH, uint256 _LUSDLoss)'

type LiquityV1Config = {
  start?: string;
  troveManager: string
  stableCoin: string
  holderRevenuePercentage?: number
  protocolRevenuePercentage?: number
  redemptionEvent?: string
  borrowingEvent?: string

  // if collateralCoin was not given, use gas token
  collateralCoin?: string
}



export const getLiquityV1LogAdapter: any = (config: LiquityV1Config): FetchV2 => {
  const fetch: FetchV2 = async (fetchOptions) => {
    const { createBalances, getLogs, api } = fetchOptions
    const dailyFees = createBalances()
    const dailyRevenue = createBalances()
    const dailySupplySideRevenue = createBalances()
    const dailyProtocolRevenue = createBalances()
    const dailyHoldersRevenue = createBalances()

    const protocolRevenueratio = config.protocolRevenuePercentage ? config.protocolRevenuePercentage / 100 : 0
    const holdersRevenueRatio = config.holderRevenuePercentage ? config.holderRevenuePercentage / 100 : 0
    const revenueRatio = protocolRevenueratio + holdersRevenueRatio

    const redemptionEvent = config.redemptionEvent || RedemptionEvent
    const borrowingEvent = config.borrowingEvent || BorrowingEvent

    // Get brrower operator contract
    const borrowerOperator = await api.call({ abi: 'address:borrowerOperationsAddress', target: config.troveManager })
    const stabilityPool = await api.call({ abi: 'address:stabilityPool', target: config.troveManager })

    // redemptions fees
    const redemptionLogs = await getLogs({
      target: config.troveManager,
      eventAbi: redemptionEvent,
    })

    // liquidations logs 
    const liquidationLogs = await getLogs({
      target: config.troveManager,
      eventAbi: LiquidationEvent,
    })

    // event LUSDBorrowingFeePaid(address indexed _borrower, uint _LUSDFee);
    const borrowingLogs = await getLogs({
      target: borrowerOperator,
      eventAbi: borrowingEvent,
    })
    
    const ETHGainWithdrawnLogs = await getLogs({
      target: stabilityPool,
      eventAbi: ETHGainWithdrawn,
    })

    // get _ETHFee from event - redemption fees are holders revenue
    redemptionLogs.forEach((logs) => {
      if (config.collateralCoin) {
        dailyFees.addToken(config.collateralCoin, BigInt(logs['_ETHFee']), METRICS.RedemptionFee)
        dailyRevenue.addToken(config.collateralCoin, BigInt(logs['_ETHFee']) * BigInt(revenueRatio), METRICS.RedemptionFee)
        dailyProtocolRevenue.addToken(config.collateralCoin, BigInt(logs['_ETHFee'] * BigInt(protocolRevenueratio)), METRICS.RedemptionFee)
        dailyHoldersRevenue.addToken(config.collateralCoin, BigInt(logs['_ETHFee'] * BigInt(holdersRevenueRatio)), METRICS.RedemptionFee)
      } else {
        dailyFees.addGasToken(BigInt(logs['_ETHFee']), METRICS.RedemptionFee)
        dailyRevenue.addGasToken(BigInt(logs['_ETHFee']) * BigInt(revenueRatio), METRICS.RedemptionFee)
        dailyProtocolRevenue.addGasToken(BigInt(logs['_ETHFee'] * BigInt(protocolRevenueratio)), METRICS.RedemptionFee)
        dailyHoldersRevenue.addGasToken(BigInt(logs['_ETHFee'] * BigInt(holdersRevenueRatio)), METRICS.RedemptionFee)
      }
    })

    // get _LUSDFee from event - borrow fees are revenue
    borrowingLogs.forEach((logs) => {
      dailyFees.add(config.stableCoin, BigInt(logs['_LUSDFee']), METRICS.BorrowFees)
      dailyRevenue.add(config.stableCoin, BigInt(logs['_LUSDFee']) * BigInt(revenueRatio), METRICS.BorrowFees)
      dailyProtocolRevenue.add(config.stableCoin, BigInt(logs['_LUSDFee']) * BigInt(protocolRevenueratio), METRICS.BorrowFees)
      dailyHoldersRevenue.add(config.stableCoin, BigInt(logs['_LUSDFee']) * BigInt(holdersRevenueRatio), METRICS.BorrowFees)
    })

    // get _LUSDGasCompensation from event - gas compensations are supplySideRevenue
    liquidationLogs.forEach((logs) => {
      dailyFees.add(config.stableCoin, BigInt(logs['_LUSDGasCompensation']), METRICS.GasCompensation)
      dailySupplySideRevenue.add(config.stableCoin, BigInt(logs['_LUSDGasCompensation']), METRICS.GasCompensation)

      if (config.collateralCoin) {
        dailyFees.addToken(config.collateralCoin, BigInt(logs['_collGasCompensation']), METRICS.GasCompensation)
        dailySupplySideRevenue.addToken(config.collateralCoin, BigInt(logs['_collGasCompensation']), METRICS.GasCompensation)
      } else {
        dailyFees.addGasToken(BigInt(logs['_collGasCompensation']), METRICS.GasCompensation)
        dailySupplySideRevenue.addGasToken(BigInt(logs['_collGasCompensation']), METRICS.GasCompensation)
      }
    })
    
    // count liquidation gain to supplyside
    ETHGainWithdrawnLogs.forEach((logs) => {
      // add col gain to balance
      if (config.collateralCoin) {
        dailyFees.add(config.collateralCoin, BigInt(logs['_ETH']), METRICS.LiquidationProfit)
        dailySupplySideRevenue.add(config.collateralCoin, BigInt(logs['_ETH']), METRICS.LiquidationProfit)
      } else {
        dailyFees.addGasToken(BigInt(logs['_ETH']), METRICS.LiquidationProfit)
        dailySupplySideRevenue.addGasToken(BigInt(logs['_ETH']), METRICS.LiquidationProfit)
      }
      
      // add stablecoin loss to balance
      dailyFees.add(config.stableCoin, -Number(logs['_LUSDLoss']), METRICS.LiquidationProfit)
      dailySupplySideRevenue.add(config.stableCoin, -Number(logs['_LUSDLoss']), METRICS.LiquidationProfit)
    })

    return {
      dailyFees,
      dailyRevenue,
      dailySupplySideRevenue,
      dailyProtocolRevenue,
      dailyHoldersRevenue,
    }
  }
  return fetch
}

const defaultV1methodology = {
  Fees: 'Total interest, redemption fees paid by borrowers and liquidation profit',
  Revenue: 'Total fees distributed to protocol and token holders',
  HoldersRevenue: 'Total fees distributed to holders',
  SupplySideRevenue: 'Total gas compensation to liquidators and liquidation profit to stability pool stakers.',
  ProtocolRevenue: 'Total fees distributed to protocol',
}

export function liquityV1Exports(config: IJSON<LiquityV1Config>, overrides?: Partial<SimpleAdapter>) {
  const exportObject: BaseAdapter = {}
  Object.entries(config).map(([chain, chainConfig]) => {
    exportObject[chain] = {
      fetch: getLiquityV1LogAdapter(chainConfig),
      start: chainConfig.start,
    }
  })
  return {
    pullHourly: true,
    version: 2,
    adapter: exportObject,
    methodology: defaultV1methodology,
    ...overrides,
  } as SimpleAdapter
}


const v2ExportsConfig = {
  felix:{
    [CHAIN.HYPERLIQUID]: { collateralRegistry: '0x9De1e57049c475736289Cb006212F3E1DCe4711B', stableTokenAbi: "address:feUSDToken", stabilityPoolRatio: 1, start: '2025-03-14' }
  },
  mustang:{
    [CHAIN.SAGA]: { collateralRegistry: '0xF39bdCfB55374dDb0948a28af00b6474A566Ac22', stabilityPoolRatio: 1, start: '2025-11-28' }
  },
  nerite:{
    [CHAIN.ARBITRUM]: { collateralRegistry: '0x7f7fbc2711c0d6e8ef757dbb82038032dd168e68', stabilityPoolRatio: 1, start: '2025-07-11' }
  },
  "orki-finance":{
    [CHAIN.SWELLCHAIN]: { collateralRegistry: '0xce9f80a0dcd51fb3dd4f0d6bec3afdcaea10c912', stabilityPoolRatio: 1, start: '2025-05-13' }
  },
  "quill-fi":{
    scroll: { collateralRegistry: '0xcc4f29f9d1b03c8e77fc0057a120e2c370d6863d', stabilityPoolRatio: 1, start: '2025-01-23' }
  },
  "defi-dollar-cdp":{
    [CHAIN.ETHEREUM]: { collateralRegistry: '0x1ec9287465ef04a7486779e81370c15624c939e8', stabilityPoolRatio: 1, start: '2025-07-04' }
  },
  "ebisu-ebusd":{
    [CHAIN.ETHEREUM]: { collateralRegistry: '0x5e159fAC2D137F7B83A12B9F30ac6aB2ba6d45E7', stabilityPoolRatio: 1, start: '2025-06-05' },
    [CHAIN.PLASMA]: { collateralRegistry: '0x602096a2f43b43d11dcb3713702dda963c45adc6', stabilityPoolRatio: 1, start: '2025-10-15' },
  },
  "enosys-loans":{
    [CHAIN.FLARE]: { collateralRegistry: '0x9474206bc035D03d142264fd9913d1D51246d3AC', stabilityPoolRatio: 1, start: '2025-12-09' }
  },
}

type V1Entry = { config: IJSON<LiquityV1Config>, overrides?: Partial<SimpleAdapter> }

const v1Entries: Record<string, V1Entry> = {
  "threshold-thusd": {
    config: {
      [CHAIN.ETHEREUM]: {
        troveManager: '0xfC7d41A684b7dB7c817A9dDd028f9A31c2F6f893',
        redemptionEvent: 'event Redemption(uint256 _attemptedTHUSDAmount, uint256 _actualTHUSDAmount, uint256 _collateralSent, uint256 _ETHFee)',
        borrowingEvent: 'event THUSDBorrowingFeePaid(address indexed _borrower, uint256 _LUSDFee)',
        stableCoin: '0xCFC5bD99915aAa815401C5a41A927aB7a38d29cf',
        protocolRevenuePercentage: 100,
      }
    },
  },
  "teddy-cash": {
    config: {
      [CHAIN.AVAX]: {
        troveManager: '0xd22b04395705144Fd12AfFD854248427A2776194',
        stableCoin: '0x4fbf0429599460D327BD5F55625E30E4fC066095',
      }
    },
  },
  liquity: {
    config: {
      [CHAIN.ETHEREUM]: {
        start: '2021-04-06',
        troveManager: '0xA39739EF8b0231DbFA0DcdA07d7e29faAbCf4bb2',
        stableCoin: '0x5f98805A4E8be255a32880FDeC7F6728C6568bA0',
        holderRevenuePercentage: 100,
        protocolRevenuePercentage: 0,
      }
    },
    overrides: {
      methodology: {
        Fees: 'Total one-time paid borrow fees, redemption fees paid by borrowers, liquidation gas compensations.',
        Revenue: 'Borrow fees, redemption fees are distibuted to LUSD stability pool and LQTY stakers.',
        HoldersRevenue: 'Borrow fees, redemption fees are distibuted to LUSD stability pool and LQTY stakers.',
        SupplySideRevenue: 'Liquidation gas compensations are distributed supply-side.',
        ProtocolRevenue: 'No revenue for Liquity protocol.',
      },
      breakdownMethodology: {
        Fees: {
          'Borrow Fees': 'One-time paid borrow fees paid by borrowers.',
          'Redemption Fees': 'Redemption fees paid by borrowers.',
          'Gas Compensation': 'Gas compensations paid to liquidator when trigger liquidations.',
          'Liquidation Profit': 'On liquidations, there are an amount of profit from ETH collaterals are distributed to stability pool stakers.',
        },
        Revenue: {
          'Borrow Fees': 'One-time paid borrow fees paid by borrowers.',
          'Redemption Fees': 'Redemption fees paid by borrowers.',
        },
        HoldersRevenue: {
          'Borrow Fees': 'One-time paid borrow fees paid by borrowers distributed to LUSD stability pool and LQTY stakers.',
          'Redemption Fees': 'Redemption fees paid by borrowers distributed to LUSD stability pool and LQTY stakers.',
        },
        SupplySideRevenue: {
          'Gas Compensation': 'Gas compensations paid to liquidator when trigger liquidations.',
          'Liquidation Profit': 'On liquidations, there are an amount of profit from ETH collaterals are distributed to stability pool stakers.',
        },
        ProtocolRevenue: 'No revenue for Liquity protocol.',
      },
    },
  },
  "liquidloans-io": {
    config: {
      [CHAIN.PULSECHAIN]: {
        troveManager: '0xD79bfb86fA06e8782b401bC0197d92563602D2Ab',
        redemptionEvent: 'event Redemption(uint256 _attemptedUSDLAmount, uint256 _actualUSDLAmount, uint256 _PLSSent, uint256 _ETHFee)',
        borrowingEvent: 'event USDLBorrowingFeePaid(address indexed _borrower, uint256 _LUSDFee)',
        stableCoin: '0x0deed1486bc52aa0d3e6f8849cec5add6598a162',
        holderRevenuePercentage: 100,
      }
    },
    overrides: {
      methodology: {
        Fees: 'Total one-time paid borrow fees, redemption fees paid by borrowers, liquidation gas compensations.',
        Revenue: 'Borrow fees, redemption fees are distibuted to USDL stability pool and LOAN stakers.',
        HoldersRevenue: 'Borrow fees, redemption fees are distibuted to USDL stability pool and LOAN stakers.',
        SupplySideRevenue: 'Liquidation gas compensations are distributed supply-side.',
        ProtocolRevenue: 'No revenue for protocol.',
      },
      breakdownMethodology: {
        Fees: {
          'Borrow Fees': 'One-time paid borrow fees paid by borrowers.',
          'Redemption Fees': 'Redemption fees paid by borrowers.',
          'Gas Compensation': 'Gas compensations paid to liquidator when trigger liquidations.',
        },
        Revenue: {
          'Borrow Fees': 'One-time paid borrow fees paid by borrowers.',
          'Redemption Fees': 'Redemption fees paid by borrowers.',
        },
        HoldersRevenue: {
          'Borrow Fees': 'One-time paid borrow fees paid by borrowers distributed to USDL stability pool and LOAN stakers.',
          'Redemption Fees': 'Redemption fees paid by borrowers distributed to USDL stability pool and LOAN stakers.',
        },
        SupplySideRevenue: {
          'Gas Compensation': 'Gas compensations paid to liquidator when trigger liquidations.',
        },
        ProtocolRevenue: 'No revenue for protocol.',
      },
    },
  },
  "orby-network": {
    config: {
      [CHAIN.CRONOS]: {
        troveManager: '0x7a47cf15a1fcbad09c66077d1d021430eed7ac65',
        redemptionEvent: 'event Redemption(uint256 _attemptedUSCAmount, uint256 _actualUSCAmount, uint256 _CollSent, uint256 _ETHFee)',
        borrowingEvent: 'event USCBorrowingFeePaid(address indexed _borrower, uint _LUSDFee)',
        stableCoin: '0xD42E078ceA2bE8D03cd9dFEcC1f0d28915Edea78',
        holderRevenuePercentage: 100,
      },
    },
    overrides: {
      methodology: {
        Fees: 'Total one-time paid borrow fees, redemption fees paid by borrowers, liquidation gas compensations.',
        Revenue: 'Borrow fees, redemption fees are distibuted to USC stability pool and ORB stakers.',
        HoldersRevenue: 'Borrow fees, redemption fees are distibuted to USC stability pool and ORB stakers.',
        SupplySideRevenue: 'Liquidation gas compensations are distributed supply-side.',
        ProtocolRevenue: 'No revenue for Orby Network protocol.',
      },
      breakdownMethodology: {
        Fees: {
          'Borrow Fees': 'One-time paid borrow fees paid by borrowers.',
          'Redemption Fees': 'Redemption fees paid by borrowers.',
          'Gas Compensation': 'Gas compensations paid to liquidator when trigger liquidations.',
        },
        Revenue: {
          'Borrow Fees': 'One-time paid borrow fees paid by borrowers.',
          'Redemption Fees': 'Redemption fees paid by borrowers.',
        },
        HoldersRevenue: {
          'Borrow Fees': 'One-time paid borrow fees paid by borrowers distributed to USC stability pool and ORB stakers.',
          'Redemption Fees': 'Redemption fees paid by borrowers distributed to USC stability pool and ORB stakers.',
        },
        SupplySideRevenue: {
          'Gas Compensation': 'Gas compensations paid to liquidator when trigger liquidations.',
        },
        ProtocolRevenue: 'No revenue for Orby Network protocol.',
      },
    },
  },
  "powercity-earn-protocols": {
    config: {
      [CHAIN.PULSECHAIN]: {
        troveManager: '0x118b7CF595F6476a18538EAF4Fbecbf594338B39',
        stableCoin: '0xeb6b7932da20c6d7b3a899d5887d86dfb09a6408',
        holderRevenuePercentage: 100,
      }
    },
    overrides: {
      methodology: {
        Fees: 'Total one-time paid borrow fees, redemption fees paid by borrowers, liquidation gas compensations.',
        Revenue: 'Borrow fees, redemption fees are distibuted to PXDC stability pool and EARN stakers.',
        HoldersRevenue: 'Borrow fees, redemption fees are distibuted to PXDC stability pool and EARN stakers.',
        SupplySideRevenue: 'Liquidation gas compensations are distributed supply-side.',
        ProtocolRevenue: 'No revenue for POWERCITY Earn Protocol.',
      },
      breakdownMethodology: {
        Fees: {
          'Borrow Fees': 'One-time paid borrow fees paid by borrowers.',
          'Redemption Fees': 'Redemption fees paid by borrowers.',
          'Gas Compensation': 'Gas compensations paid to liquidator when trigger liquidations.',
        },
        Revenue: {
          'Borrow Fees': 'One-time paid borrow fees paid by borrowers.',
          'Redemption Fees': 'Redemption fees paid by borrowers.',
        },
        HoldersRevenue: {
          'Borrow Fees': 'One-time paid borrow fees paid by borrowers distributed to PXDC stability pool and EARN stakers.',
          'Redemption Fees': 'Redemption fees paid by borrowers distributed to PXDC stability pool and EARN stakers.',
        },
        SupplySideRevenue: {
          'Gas Compensation': 'Gas compensations paid to liquidator when trigger liquidations.',
        },
        ProtocolRevenue: 'No revenue for POWERCITY Earn Protocol.',
      },
    },
  },
  "powercity-flex-protocols": {
    config: {
      [CHAIN.PULSECHAIN]: {
        troveManager: '0xC2D0720721d48cE85e20Dc9E01B8449D7eDd14CE',
        stableCoin: '0x1fe0319440a672526916c232eaee4808254bdb00',
        holderRevenuePercentage: 100,
      }
    },
    overrides: {
      methodology: {
        Fees: 'Total one-time paid borrow fees, redemption fees paid by borrowers, liquidation gas compensations.',
        Revenue: 'Borrow fees, redemption fees are distibuted to HEXDC stability pool and FLEX stakers.',
        HoldersRevenue: 'Borrow fees, redemption fees are distibuted to HEXDC stability pool and FLEX stakers.',
        SupplySideRevenue: 'Liquidation gas compensations are distributed supply-side.',
        ProtocolRevenue: 'No revenue for Powercity Flex Protocol.',
      },
      breakdownMethodology: {
        Fees: {
          'Borrow Fees': 'One-time paid borrow fees paid by borrowers.',
          'Redemption Fees': 'Redemption fees paid by borrowers.',
          'Gas Compensation': 'Gas compensations paid to liquidator when trigger liquidations.',
        },
        Revenue: {
          'Borrow Fees': 'One-time paid borrow fees paid by borrowers.',
          'Redemption Fees': 'Redemption fees paid by borrowers.',
        },
        HoldersRevenue: {
          'Borrow Fees': 'One-time paid borrow fees paid by borrowers distributed to HEXDC stability pool and FLEX stakers.',
          'Redemption Fees': 'Redemption fees paid by borrowers distributed to HEXDC stability pool and FLEX stakers.',
        },
        SupplySideRevenue: {
          'Gas Compensation': 'Gas compensations paid to liquidator when trigger liquidations.',
        },
        ProtocolRevenue: 'No revenue for Powercity Flex Protocol.',
      },
    },
  },
  "sable-finance": {
    config: {
      [CHAIN.BSC]: {
        troveManager: '0xEC035081376ce975Ba9EAF28dFeC7c7A4c483B85',
        redemptionEvent: 'event Redemption(uint256 _attemptedUSDSAmount, uint256 _actualUSDSAmount, uint256 _BNBSent, uint256 _ETHFee)',
        stableCoin: '0x0c6Ed1E73BA73B8441868538E210ebD5DD240FA0',
        holderRevenuePercentage: 100,
      }
    },
    overrides: {
      methodology: {
        Fees: 'Total one-time paid borrow fees, redemption fees paid by borrowers, liquidation gas compensations.',
        Revenue: 'Borrow fees, redemption fees are distibuted to USDS stability pool and SABLE stakers.',
        HoldersRevenue: 'Borrow fees, redemption fees are distibuted to USDS stability pool and SABLE stakers.',
        SupplySideRevenue: 'Liquidation gas compensations are distributed supply-side.',
        ProtocolRevenue: 'No revenue for Liquity protocol.',
      },
      breakdownMethodology: {
        Fees: {
          'Borrow Fees': 'One-time paid borrow fees paid by borrowers.',
          'Redemption Fees': 'Redemption fees paid by borrowers.',
          'Gas Compensation': 'Gas compensations paid to liquidator when trigger liquidations.',
        },
        Revenue: {
          'Borrow Fees': 'One-time paid borrow fees paid by borrowers.',
          'Redemption Fees': 'Redemption fees paid by borrowers.',
        },
        HoldersRevenue: {
          'Borrow Fees': 'One-time paid borrow fees paid by borrowers distributed to USDS stability pool and SABLE stakers.',
          'Redemption Fees': 'Redemption fees paid by borrowers distributed to USDS stability pool and SABLE stakers.',
        },
        SupplySideRevenue: {
          'Gas Compensation': 'Gas compensations paid to liquidator when trigger liquidations.',
        },
        ProtocolRevenue: 'No revenue for Liquity protocol.',
      },
    },
  },
  bookusd: {
    config: {
      [CHAIN.BSC]: {
        troveManager: '0xFe5D0aBb0C4Addbb57186133b6FDb7E1FAD1aC15',
        stableCoin: '0xc28957E946AC244612BcB205C899844Cbbcb093D',
        holderRevenuePercentage: 100,
        collateralCoin: '0xc9ad421f96579ace066ec188a7bba472fb83017f',
      }
    },
    overrides: {
      methodology: {
        Fees: 'Total one-time paid borrow fees, redemption fees paid by borrowers, liquidation gas compensations.',
        Revenue: 'Borrow fees, redemption fees are distibuted to BUD stability pool and BOOK stakers.',
        HoldersRevenue: 'Borrow fees, redemption fees are distibuted to BUD stability pool and BOOK stakers.',
        SupplySideRevenue: 'Liquidation gas compensations are distributed supply-side.',
        ProtocolRevenue: 'No revenue for protocol.',
      },
      breakdownMethodology: {
        Fees: {
          'Borrow Fees': 'One-time paid borrow fees paid by borrowers.',
          'Redemption Fees': 'Redemption fees paid by borrowers.',
          'Gas Compensation': 'Gas compensations paid to liquidator when trigger liquidations.',
        },
        Revenue: {
          'Borrow Fees': 'One-time paid borrow fees paid by borrowers.',
          'Redemption Fees': 'Redemption fees paid by borrowers.',
        },
        HoldersRevenue: {
          'Borrow Fees': 'One-time paid borrow fees paid by borrowers distributed to BUD stability pool and BOOK stakers.',
          'Redemption Fees': 'Redemption fees paid by borrowers distributed to BUD stability pool and BOOK stakers.',
        },
        SupplySideRevenue: {
          'Gas Compensation': 'Gas compensations paid to liquidator when trigger liquidations.',
        },
        ProtocolRevenue: 'No revenue for protocol.',
      },
    },
  },
}

// Define all protocols
const protocols = {} as any;
Object.entries(v2ExportsConfig).forEach(([protocolName, config]) => {
  protocols[protocolName] = liquityV2Exports(config)
})
Object.entries(v1Entries).forEach(([protocolName, { config, overrides }]) => {
  protocols[protocolName] = liquityV1Exports(config, overrides)
})

export const { protocolList, getAdapter } = createFactoryExports(protocols);
