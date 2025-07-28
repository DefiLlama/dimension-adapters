import ADDRESSES from '../helpers/coreAssets.json'
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const topic0 = 'event AccrueRewards(uint256 userRewardAmount,uint256 protocolRewardAmount)';
const address = ADDRESSES.avax.SAVAX

const fetchFees = async (options: FetchOptions) => {
  const dailyFees = options.createBalances()

  const sAvaxSupplyBefore = await options.fromApi.call({
    target: address,
    abi: 'uint256:totalSupply',
  });
  const sAvaxSupplyAfter = await options.toApi.call({
    target: address,
    abi: 'uint256:totalSupply',
  });

  const totalPooledAvaxBefore = await options.fromApi.call({
    target: address,
    abi: 'uint256:totalPooledAvax',
  });

  const totalPooledAvaxAfter = await options.toApi.call({
    target: address,
    abi: 'uint256:totalPooledAvax',
  });

  const dailyAvaxYield = (totalPooledAvaxAfter / sAvaxSupplyAfter - totalPooledAvaxBefore / sAvaxSupplyBefore) * (sAvaxSupplyAfter / 1e18);
  dailyFees.addCGToken("avalanche-2", dailyAvaxYield);

  const dailyRevenue = dailyFees.clone(0.1)
  return { dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue }
}

const methodology = {
  Fees: 'Total yields from staked Avax.',
  Revenue: '10 % of the total yields are charged by Benqi.',
  ProtocolRevenue: 'All revenue goes to the protocol'
}
const adapters: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.AVAX]: {
      fetch: fetchFees,
      start: '2022-02-13',
      meta: {
        methodology,
      },
    }
  }
}
export default adapters;
