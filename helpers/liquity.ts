import { BaseAdapter, FetchResultFees, FetchV2, IJSON, SimpleAdapter } from "../adapters/types";
import { addTokensReceived, nullAddress } from "./token";


export const getLiquityV2LogAdapter: any = ({
  collateralRegistry,
  stableTokenAbi = 'address:boldToken', // default to stableCoin
}: LiquityV2Config): FetchV2 => {
  const fetch: FetchV2 = async (fetchOptions) => {
    const { createBalances, getLogs, api } = fetchOptions
    const dailyFees = createBalances()

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

    await addTokensReceived({ options: fetchOptions, targets: stabilityPools.concat(interestRouters), tokens: [stableCoin], balances: dailyFees, fromAdddesses: [nullAddress] })

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
      logs.forEach((log: any) => dailyFees.add(collateralToken, log._ETHFee))
    })

    liquidationLogs.forEach((logs, i) => {
      const collateralToken = tokens[i]
      logs.forEach((log: any) => {
        dailyFees.add(collateralToken, log._collGasCompensation)
        dailyFees.add(stableCoin, log._boldGasCompensation)
      })
    })


    return { dailyFees, }
  }
  return fetch
}

type LiquityV2Config = {
  collateralRegistry: string,
  stableTokenAbi?: string,
}


export function liquityV2Exports(config: IJSON<LiquityV2Config>) {
  const exportObject: BaseAdapter = {}
  Object.entries(config).map(([chain, chainConfig]) => {
    exportObject[chain] = {
      fetch: getLiquityV2LogAdapter(chainConfig),
    }
  })
  return { adapter: exportObject, version: 2 } as SimpleAdapter
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

    // get _ETHFee from event
    redemptionLogs.forEach((logs) => {
      if (config.collateralCoin) {
        dailyFees.addToken(config.collateralCoin, BigInt(logs['_ETHFee']))
      } else {
        dailyFees.addGasToken(BigInt(logs['_ETHFee']))
      }
    })

    // get _LUSDFee from event
    borrowingLogs.forEach((logs) => {
      dailyFees.add(config.stableCoin, BigInt(logs['_LUSDFee']))
    })

    const supplySideFees = createBalances()
    // get _LUSDGasCompensation from event
    liquidationLogs.forEach((logs) => {
      supplySideFees.add(config.stableCoin, BigInt(logs['_LUSDGasCompensation']))

      if (config.collateralCoin) {
        supplySideFees.addToken(config.collateralCoin, BigInt(logs['_collGasCompensation']))
      } else {
        supplySideFees.addGasToken(BigInt(logs['_collGasCompensation']))
      }
    })

    const result: FetchResultFees = { dailyFees }

    let dailyRevenue = null
    // validate percentage
    const totalRevPercent = Number(config.holderRevenuePercentage || 0) + Number(config.protocolRevenuePercentage || 0)
    if (totalRevPercent > 100) {
      throw new Error('Total revenue percentage cannot exceed 100%')
    }
    if (config.holderRevenuePercentage) {
      const dailyHoldersRevenue = dailyFees.clone(config.holderRevenuePercentage / 100)
      dailyRevenue = dailyHoldersRevenue.clone()
      result.dailyHoldersRevenue = dailyHoldersRevenue
    }
    if (config.protocolRevenuePercentage) {
      const dailyProtocolRevenue = dailyFees.clone(config.protocolRevenuePercentage / 100)
      result.dailyProtocolRevenue = dailyProtocolRevenue
      if (dailyRevenue) {
        dailyRevenue.addBalances(dailyProtocolRevenue)
      } else {
        dailyRevenue = dailyProtocolRevenue.clone()
      }
    }
    if (dailyRevenue) {
      result.dailyRevenue = dailyRevenue
    }
    result.dailySupplySideRevenue = supplySideFees
    dailyFees.addBalances(supplySideFees)

    return result
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
    adapter: exportObject, version: 2,
    methodology: {
      Fees: 'Total interest, redemption fees paid by borrowers and liquidation profit',
      Revenue: 'Total fees distributed to protocol and token holders',
      HoldersRevenue: 'Total fees distributed to holders',
      SupplySideRevenue: 'Total gas compensation to borrowers',
      ProtocolRevenue: 'Total fees distributed to protocol',
    },
  } as SimpleAdapter
}