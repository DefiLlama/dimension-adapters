import { BaseAdapter, FetchV2, IJSON, SimpleAdapter } from "../adapters/types";
import { addTokensReceived, nullAddress } from "./token";
import { METRIC } from "./metrics";

const METRICS = {
  GasCompensation: 'Gas Compensation',
  RedemptionFee: 'Redemption Fees',
  BorrowFees: 'Borrow Fees',
}

export const getLiquityV2LogAdapter: any = ({
  collateralRegistry,
  stableTokenAbi = 'address:boldToken', // default to stableCoin
  stabilityPoolRatio,
  revenueRatio,
}: LiquityV2Config): FetchV2 => {
  const fetch: FetchV2 = async (fetchOptions) => {
    const { createBalances, getLogs, api } = fetchOptions

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

    const borrowInterest = createBalances()
    await addTokensReceived({ options: fetchOptions, targets: stabilityPools.concat(interestRouters), tokens: [stableCoin], balances: borrowInterest, fromAdddesses: [nullAddress] })

    const dailyFees = createBalances()
    dailyFees.addBalances(borrowInterest, METRIC.BORROW_INTEREST)

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
      logs.forEach((log: any) => dailyFees.add(collateralToken, log._ETHFee, METRICS.RedemptionFee))
    })

    liquidationLogs.forEach((logs, i) => {
      const collateralToken = tokens[i]
      logs.forEach((log: any) => {
        dailyFees.add(collateralToken, log._collGasCompensation, METRICS.GasCompensation)
        dailyFees.add(stableCoin, log._boldGasCompensation, METRICS.GasCompensation)
      })
    })


    return { dailyFees, dailyRevenue: dailyFees }
  }
  return fetch
}

type LiquityV2Config = {
  collateralRegistry: string,
  stableTokenAbi?: string,
  stabilityPoolRatio?: number,
  revenueRatio?: number,
}


export const defaultV2methodology = {
  Fees: 'Total interest, redemption fees paid by borrowers and liquidation profit',
  Revenue: 'Total interest, redemption fees paid by borrowers and liquidation profit',
}

export const defaultV2BreakdownMethodology = {
  Fees: {
    'Borrow Interest': 'borrow interests paid by borrowers.',
    'Redemption Fees': 'Redemption fees paid by borrowers.',
    'Gas Compensation': 'Gas compensations paid to liquidator when trigger liquidations.',
  },
  Revenue: {
    'Borrow Interest': 'borrow interests paid by borrowers.',
    'Redemption Fees': 'Redemption fees paid by borrowers.',
  },
}

export function liquityV2Exports(config: IJSON<LiquityV2Config>) {
  const exportObject: BaseAdapter = {}
  Object.entries(config).map(([chain, chainConfig]) => {
    exportObject[chain] = {
      fetch: getLiquityV2LogAdapter(chainConfig),
    }
  })
  return { adapter: exportObject, version: 2, methodology: defaultV2methodology, breakdownMethodology: defaultV2BreakdownMethodology } as SimpleAdapter
}

const RedemptionEvent = 'event Redemption(uint _attemptedLUSDAmount, uint _actualLUSDAmount, uint _ETHSent, uint _ETHFee)'
const BorrowingEvent = 'event LUSDBorrowingFeePaid(address indexed _borrower, uint _LUSDFee)'
const liquidationEvent = 'event Liquidation(uint _liquidatedDebt, uint _liquidatedColl, uint _collGasCompensation, uint _LUSDGasCompensation)'

type LiquityV1Config = {
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
    const revenueratio = protocolRevenueratio + holdersRevenueRatio

    const redemptionEvent = config.redemptionEvent || RedemptionEvent
    const borrowingEvent = config.borrowingEvent || BorrowingEvent

    // Get brrower operator contract
    const borrowerOperator = await api.call({ abi: 'address:borrowerOperationsAddress', target: config.troveManager })

    // redemptions fees
    const redemptionLogs = await getLogs({
      target: config.troveManager,
      eventAbi: redemptionEvent,
    })

    // liquidations logs 
    const liquidationLogs = await getLogs({
      target: config.troveManager,
      eventAbi: liquidationEvent,
    })

    // event LUSDBorrowingFeePaid(address indexed _borrower, uint _LUSDFee);
    const borrowingLogs = await getLogs({
      target: borrowerOperator,
      eventAbi: borrowingEvent,
    })

    // get _ETHFee from event - redemption fees are revenue
    redemptionLogs.forEach((logs) => {
      if (config.collateralCoin) {
        dailyFees.addToken(config.collateralCoin, BigInt(logs['_ETHFee']), METRICS.RedemptionFee)
        dailyRevenue.addToken(config.collateralCoin, BigInt(logs['_ETHFee']) * BigInt(revenueratio), METRICS.RedemptionFee)
        dailyProtocolRevenue.addToken(config.collateralCoin, BigInt(logs['_ETHFee'] * BigInt(protocolRevenueratio)), METRICS.RedemptionFee)
        dailyHoldersRevenue.addToken(config.collateralCoin, BigInt(logs['_ETHFee'] * BigInt(holdersRevenueRatio)), METRICS.RedemptionFee)
      } else {
        dailyFees.addGasToken(BigInt(logs['_ETHFee']), METRICS.RedemptionFee)
        dailyRevenue.addGasToken(BigInt(logs['_ETHFee']) * BigInt(revenueratio), METRICS.RedemptionFee)
        dailyProtocolRevenue.addGasToken(BigInt(logs['_ETHFee'] * BigInt(protocolRevenueratio)), METRICS.RedemptionFee)
        dailyHoldersRevenue.addGasToken(BigInt(logs['_ETHFee'] * BigInt(holdersRevenueRatio)), METRICS.RedemptionFee)
      }
    })

    // get _LUSDFee from event - borrow fees are revenue
    borrowingLogs.forEach((logs) => {
      dailyFees.add(config.stableCoin, BigInt(logs['_LUSDFee']), METRICS.BorrowFees)
      dailyRevenue.add(config.stableCoin, BigInt(logs['_LUSDFee']) * (BigInt(protocolRevenueratio)) + BigInt(holdersRevenueRatio), METRICS.BorrowFees)
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

    return {
      dailyFees,
      dailyRevenue: revenueratio > 0 ? dailyRevenue : undefined,
      dailyProtocolRevenue: config.protocolRevenuePercentage ? dailyProtocolRevenue : undefined,
      dailySupplySideRevenue,
      dailyHoldersRevenue: config.holderRevenuePercentage ? dailyHoldersRevenue : undefined,
    }
  }
  return fetch
}

export function liquityV1Exports(config: IJSON<LiquityV1Config>) {
  const exportObject: BaseAdapter = {}
  Object.entries(config).map(([chain, chainConfig]) => {
    exportObject[chain] = {
      fetch: getLiquityV1LogAdapter(chainConfig),
    }
  })
  return {
    version: 2,
    adapter: exportObject,
    methodology: {
      Fees: 'Total interest, redemption fees paid by borrowers and liquidation profit',
      Revenue: 'Total fees distributed to protocol and token holders',
      HoldersRevenue: 'Total fees distributed to holders',
      SupplySideRevenue: 'Total gas compensation to borrowers',
      ProtocolRevenue: 'Total fees distributed to protocol',
    },
  } as SimpleAdapter
}