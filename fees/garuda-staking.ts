import { FetchOptions, SimpleAdapter } from '../adapters/types';
import { CHAIN } from '../helpers/chains';

const GETH_CONTRACT = '0x3802c218221390025bceabbad5d8c59f40eb74b8';
const SERVICE_FEE_RATE = 0.1; // 10% of rewards
const DEFAULT_APY = 0.03; // Fallback if API fails

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const totalSupply = await options.fromApi.call({ target: GETH_CONTRACT, abi: 'uint256:totalSupply' });

  const yearInSecs = 265 * 24 * 3600
  const timeframe = options.toTimestamp - options.fromTimestamp
  const totalStakingRewards = Number(totalSupply) * DEFAULT_APY * timeframe / yearInSecs / (1 - SERVICE_FEE_RATE)

  dailyFees.addGasToken(totalStakingRewards);
  dailyRevenue.addGasToken(totalStakingRewards * SERVICE_FEE_RATE);
  dailySupplySideRevenue.addGasToken(totalStakingRewards * (1 - SERVICE_FEE_RATE));

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
  };
};

const methodology = {
  Fees: 'Ethereum staking rewards estimated from GETH supply x ETH staking APY / 365. APY is fixed and sourced from https://guarda.com/staking/ethereum-staking.',
  Revenue: '10% service fee on staking rewards to cover validator infrastructure costs.',
  ProtocolRevenue: 'Same as Revenue - 10% of estimated staking rewards.',
  SupplySideRevenue: '90% of estimated staking rewards to stakers.',
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch,
      start: '2021-10-20',
    },
  },
  methodology,
};

export default adapter;
