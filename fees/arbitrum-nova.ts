
import { FetchOptions, FetchResultV2, SimpleAdapter } from '../adapters/types';
import { CHAIN } from '../helpers/chains';
import ADDRESSES from '../helpers/coreAssets.json';

async function getFees(options: FetchOptions) {

  const feeWallet = '0xc9722CfDDFbC6aF4E77023E8B5Bd87489EFEbf5F';
  const l1FeeVault = '0x3B68a689c929327224dBfCe31C1bf72Ffd2559Ce';
  const baseFeeVault = '0x9fCB6F75D99029f28F6F4a1d277bae49c5CAC79f';
  const feeVaults = [l1FeeVault, baseFeeVault, feeWallet];

  const { api, fromApi, createBalances } = options;
  const balances = createBalances();
  await api.sumTokens({ owners: feeVaults, tokens: [ADDRESSES.null] })
  await fromApi.sumTokens({ owners: feeVaults, tokens: [ADDRESSES.null] })
  balances.addBalances(api.getBalancesV2())
  balances.subtract(fromApi.getBalancesV2())
  return balances
}


const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
  const dailyFees = await getFees(options)

  return { dailyFees }
}

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.ARBITRUM_NOVA]: {
      fetch: fetch,
      start: 1691971200,
    }
  }
}

export default adapter;
