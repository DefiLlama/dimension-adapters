import ADDRESSES from '../helpers/coreAssets.json'
import { Adapter, FetchOptions, } from '../adapters/types';
import { CHAIN } from '../helpers/chains';

const address = '0x864d6cAfFEa0725057E6ED775b34E6Dd6F04AD49';
const fetchFees = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  await options.api.sumTokens({ owners: [address], tokens: [ADDRESSES.null] })
  await options.fromApi.sumTokens({ owners: [address], tokens: [ADDRESSES.null] })
  dailyFees.addBalances(options.api.getBalancesV2())
  dailyFees.subtract(options.fromApi.getBalancesV2())
  return {
    dailyFees,
    dailyRevenue: dailyFees.clone(),
  }
}

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.BASE]: {
      fetch: fetchFees,
      start: '2022-07-01',
    }
  },
  methodology: {
    Fees: "Fees paid by users while trading on social network.",
    Revenue: "Fees paid by users while trading on social network.",
  },
}

export default adapter;
