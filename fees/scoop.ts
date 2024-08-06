import { Adapter, FetchOptions, } from '../adapters/types';
import { CHAIN } from '../helpers/chains';

const address = '0x864d6cAfFEa0725057E6ED775b34E6Dd6F04AD49';
const fetchFees = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  await options.api.sumTokens({ owners: [address], tokens: ["0x0000000000000000000000000000000000000000"] })
  await options.fromApi.sumTokens({ owners: [address], tokens: ["0x0000000000000000000000000000000000000000"] })
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
      start: 1656633600, //
    }
  }
}

export default adapter;
