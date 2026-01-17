import { BaseAdapter, FetchV2, IJSON, SimpleAdapter } from "../adapters/types";
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
  return { adapter: exportObject, version: 2, methodology: defaultV2methodology, breakdownMethodology: defaultV2BreakdownMethodology } as SimpleAdapter
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

export function liquityV1Exports(config: IJSON<LiquityV1Config>) {
  const exportObject: BaseAdapter = {}
  Object.entries(config).map(([chain, chainConfig]) => {
    exportObject[chain] = {
      fetch: getLiquityV1LogAdapter(chainConfig),
      start: chainConfig.start,
    }
  })
  return {
    version: 2,
    adapter: exportObject,
    methodology: {
      Fees: 'Total interest, redemption fees paid by borrowers and liquidation profit',
      Revenue: 'Total fees distributed to protocol and token holders',
      HoldersRevenue: 'Total fees distributed to holders',
      SupplySideRevenue: 'Total gas compensation to liquidators and liquidation profit to stability pool stakers.',
      ProtocolRevenue: 'Total fees distributed to protocol',
    },
  } as SimpleAdapter
}
