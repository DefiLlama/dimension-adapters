import ADDRESSES from '../helpers/coreAssets.json'
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";

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

  const dailysAvaxHoldersYield = (totalPooledAvaxAfter / sAvaxSupplyAfter - totalPooledAvaxBefore / sAvaxSupplyBefore) * (sAvaxSupplyAfter / 1e18);
  dailyFees.addCGToken("avalanche-2", dailysAvaxHoldersYield/0.9, METRIC.STAKING_REWARDS);

  const dailyRevenue = dailyFees.clone(0.1, METRIC.PROTOCOL_FEES)
  const dailySupplySideRevenue = dailyFees.clone(0.9, METRIC.STAKING_REWARDS)
  
  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
    dailyHoldersRevenue: 0,
  }
}

const methodology = {
  Fees: 'Total yields from staked Avax.',
  Revenue: '10% of the total yields are charged by Benqi.',
  ProtocolRevenue: 'All revenue goes to the protocol.',
  HoldersRevenue: 'No revenue share to QI token holders.',
  SupplySideRevenue: 'Stakers earn 90% AVAX staking rewards.',
}

const breakdownMethodology = {
  Fees: {
    [METRIC.STAKING_REWARDS]: 'Total AVAX staking rewards earned from validators for all AVAX staked through BENQI (100% of validator rewards)',
  },
  Revenue: {
    [METRIC.PROTOCOL_FEES]: 'Protocol fee retained by BENQI from staking rewards (10% of total rewards)',
  },
  SupplySideRevenue: {
    [METRIC.STAKING_REWARDS]: 'AVAX staking rewards distributed to sAVAX holders through appreciation of sAVAX/AVAX ratio (90% of total rewards)',
  }
}

const adapters: SimpleAdapter = {
  version: 2,
  methodology,
  breakdownMethodology,
  adapter: {
    [CHAIN.AVAX]: {
      fetch: fetchFees,
      start: '2022-02-13',
    }
  }
}

export default adapters;
