import { FetchOptions, SimpleAdapter } from '../adapters/types';
import { CHAIN } from '../helpers/chains';

const GETH_CONTRACT = '0x3802c218221390025bceabbad5d8c59f40eb74b8';

const abis = {
  totalSupply: 'uint256:totalSupply',
};

// Source: https://guarda.com/staking/ethereum-staking/
const ETH_STAKING_APY = 0.03; // 3%
const SERVICE_FEE_RATE = 0.1; // 10% of rewards

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();

  // Get GETH total supply at start and end of day
  const supplyStart = await options.fromApi.call({
    target: GETH_CONTRACT,
    abi: abis.totalSupply,
  });

  const supplyEnd = await options.toApi.call({
    target: GETH_CONTRACT,
    abi: abis.totalSupply,
  });

  // Calculate average supply for the day (in ETH, since GETH:ETH is 1:1)
  const avgSupply = (BigInt(supplyStart) + BigInt(supplyEnd)) / 2n;

  // Calculate daily staking rewards: (avgSupply * APY) / 365
  const dailyStakingRewards =
    (avgSupply * BigInt(Math.floor(ETH_STAKING_APY * 1e18))) /
    BigInt(1e18) /
    365n;

  // Total fees = staking rewards (all rewards go to stakers, but service fee is taken from them)
  dailyFees.addGasToken(dailyStakingRewards);

  // Protocol revenue = 10% service fee on staking rewards
  const protocolRevenue =
    (dailyStakingRewards * BigInt(Math.floor(SERVICE_FEE_RATE * 1e18))) /
    BigInt(1e18);
  dailyRevenue.addGasToken(protocolRevenue);

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
  };
};

const methodology = {
  Fees: 'Ethereum staking rewards generated from GETH pool (staked ETH × ~3% APY / 365). Distributed quarterly to GETH token holders.',
  Revenue:
    '10% service fee on staking rewards to cover validator infrastructure costs.',
  ProtocolRevenue: 'Same as Revenue - 10% of on-chain staking rewards.',
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
