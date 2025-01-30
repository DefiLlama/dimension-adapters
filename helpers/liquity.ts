
import { BaseAdapter, FetchV2, IJSON, SimpleAdapter } from "../adapters/types";
import { addTokensReceived, nullAddress } from "./token";


export const getLiquityV2LogAdapter: any = ({ collateralRegistry }: LiquityV2Config): FetchV2 => {
  const fetch: FetchV2 = async (fetchOptions) => {
    const { createBalances, getLogs, api } = fetchOptions
    const dailyFees = createBalances()

    const troves = await api.fetchList({ lengthAbi: 'totalCollaterals', itemAbi: 'getTroveManager', target: collateralRegistry })
    const activePools = await api.multiCall({ abi: 'address:activePool', calls: troves })
    const stableCoin = await api.call({ abi: 'address:boldToken', target: collateralRegistry })
    const tokens = await api.multiCall({ abi: 'address:collToken', calls: activePools })
    let interestRouters = await api.multiCall({ abi: 'address:interestRouter', calls: activePools })
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

