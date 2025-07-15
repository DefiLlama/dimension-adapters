import { FetchOptions, FetchV2, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { addTokensReceived, nullAddress } from "../helpers/token";

const collateralRegistry = '0x7f7fbc2711c0d6e8ef757dbb82038032dd168e68'

const abis = {
  boldToken: 'address:boldToken',
  activePool: 'address:activePool',
  addressesRegistry: 'address:addressesRegistry',
  interestRouter: 'address:interestRouter',
  collToken: 'address:collToken',
  stabilityPool: 'address:stabilityPool'
}

const eventAbis = {
  redemptionFeePaidToTrove: 'event RedemptionFeePaidToTrove(uint256 indexed _troveId, uint256 _ETHFee)',
  liquidation: 'event Liquidation(uint256 _debtOffsetBySP, uint256 _debtRedistributed, uint256 _boldGasCompensation, uint256 _collGasCompensation, uint256 _collSentToSP, uint256 _collRedistributed, uint256 _collSurplus, uint256 _L_ETH, uint256 _L_boldDebt, uint256 _price)'
}

const fetch: FetchV2 = async (fetchOptions: FetchOptions) => {
  const { createBalances, getLogs, api } = fetchOptions
  const dailyFees = createBalances()

  const [troves, stableCoin] = await Promise.all([
    api.fetchList({ lengthAbi: 'totalCollaterals', itemAbi: 'getTroveManager', target: collateralRegistry }),
    api.call({ abi: abis.boldToken, target: collateralRegistry })
  ])

  const activePools = await api.multiCall({ abi: abis.activePool, calls: troves })

  const [addressesRegistries, tokens, stabilityPools] = await Promise.all([
    api.multiCall({ abi: abis.addressesRegistry, calls: activePools }),
    api.multiCall({ abi: 'address:collToken', calls: activePools }),
    api.multiCall({ abi: 'address:stabilityPool', calls: activePools })
  ])

  const interestRouters = await api.multiCall({ abi: abis.interestRouter, calls: addressesRegistries })

  await addTokensReceived({ options: fetchOptions, targets: stabilityPools.concat(interestRouters), tokens: [stableCoin], balances: dailyFees, fromAdddesses: [nullAddress] })

  const redemptionLogs = await getLogs({ targets: troves, eventAbi: eventAbis.redemptionFeePaidToTrove, flatten: false })
  const liquidationLogs = await getLogs({ targets: troves, eventAbi: eventAbis.liquidation, flatten: false })

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

  return { dailyFees }
}

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.ARBITRUM]: { fetch },
  },
};

export default adapter;