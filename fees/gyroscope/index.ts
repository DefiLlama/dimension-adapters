import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { addTokensReceived } from '../../helpers/token';

// As per: https://docs.gyro.finance/deployed-contracts/pools.html#fees-receiver
const config = {
  [CHAIN.BASE]: ['0xA01ba17778A860EC92053325d0de4022240ceeA4',],
  [CHAIN.ETHEREUM]: ['0xA01ba17778A860EC92053325d0de4022240ceeA4',],
  [CHAIN.AVAX]: ['0xA01ba17778A860EC92053325d0de4022240ceeA4',],
  [CHAIN.ARBITRUM]: ['0xA01ba17778A860EC92053325d0de4022240ceeA4',],
  [CHAIN.XDAI]: ['0xA01ba17778A860EC92053325d0de4022240ceeA4'],
  [CHAIN.OPTIMISM]: ['0xA01ba17778A860EC92053325d0de4022240ceeA4'],
  
  // [CHAIN.SEI]: ['0xA01ba17778A860EC92053325d0de4022240ceeA4',], -- not supported by Llama indexer as is
  // [CHAIN.POLYGON]: [],
}
async function fetch(options: FetchOptions) {
  const { chain, api } = options;

  const dailyFees = await addTokensReceived({ options, targets: config[chain] })

  /* 
  const keys = Object.keys(dailyFees.getBalances())
  const tokens = keys.map((key) => key.split(':')[1])
  const allVaults = await api.multiCall({ abi: 'address:getVault', calls: tokens, permitFailure: true})
  const balancerVaultTokens = tokens.filter((_, i) => allVaults[i])
  const vaults = allVaults.filter((_, i) => allVaults[i])
  const actualSupplies = await api.multiCall({  abi: 'uint256:getActualSupply', calls: balancerVaultTokens})
  const poolIds  = await api.multiCall({  abi: 'function getPoolId() view returns (bytes32)', calls: balancerVaultTokens })
  const calls = poolIds.map((poolId, i) => ({ target: vaults[i], params: [poolId] }))
  const poolBalances = await api.multiCall({  abi: 'function getPoolTokens(bytes32) view returns (address[] tokens, uint256[] bals, uint256)', calls})

  const balancesObject = dailyFees.getBalances()
  api.log(balancesObject)
  api.log(await dailyFees.getUSDJSONs())
  
  poolBalances.forEach((poolBalance, i) => {
    const balancerVaultToken = balancerVaultTokens[i]
    const actualSupply = actualSupplies[i]
    const lpBalance: any = balancesObject[`ethereum:${balancerVaultToken}`]
    if (!lpBalance) {
      api.log(`No balance for ${balancerVaultToken}`)
      return
    }
    delete balancesObject[`ethereum:${balancerVaultToken}`]
    const ratio = lpBalance / actualSupply
    api.log(balancerVaultToken, ratio)
    poolBalance.tokens.forEach((token, i) => dailyFees.add(token, poolBalance.bals[i]*ratio))
  })

  api.log(balancesObject)
  api.log(await dailyFees.getUSDJSONs())
*/
  
  return {
    dailyFees
  };
};


const adapter: Adapter = {
  version: 2,
  adapter: {
  }
}

Object.keys(config).forEach((chain) => {
  adapter.adapter[chain] = { fetch }
})

export default adapter;
