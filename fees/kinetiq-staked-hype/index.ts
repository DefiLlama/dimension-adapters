import { CHAIN } from "../../helpers/chains";
import { Adapter, FetchOptions, FetchResultV2 } from "../../adapters/types";
import { addTokensReceived } from "../../helpers/token";

const METRICS = {
  StakingRewards: 'kHYPE Staking Rewards',
  StakingRewardsToLPs: 'kHYPE Staking Rewards To Stakers',
  PerformanceFees: 'kHYPE Performance Fees',
  UnstakingFees: 'kHYPE Unstaking Fees',
  TokenByBack: 'Token Buy Back',
}

const methodology = {
  Fees: 'Total unstaking fees and rewards from staked HYPE.',
  Revenue: 'Total fee through 0.1% KHYPE unstaking fee before 2026-04-09, 10% performance fees after that.',
  ProtocolRevenue: 'From 2026-04-09, 30% of revenue goes to the treasury, it was 100% before.',
  SupplySideRevenue: 'From 2026-04-09, 90% staking rewards distributed to HYPE stakers, it was 100% before.',
  HoldersRevenue: 'From 2026-04-09, 70% of performance fees (which is 10% staking rewards) are used to by back KNTQ.',
};

const breakdownMethodology = {
  Fees: {
    [METRICS.StakingRewards]: 'Total staking rewards from staked HYPE.',
    [METRICS.UnstakingFees]: 'Total fees from 0.1% KHYPE unstaking fee.',
  },
  SupplySideRevenue: {
    [METRICS.StakingRewardsToLPs]: 'All staking rewards distributed to HYPE stakers.',
  },
  Revenue: {
    [METRICS.UnstakingFees]: 'Total fees from 0.1% KHYPE unstaking fee.',
    [METRICS.PerformanceFees]: 'Protocol takes 10% of staking rewards from 2026-04-09',
  },
  ProtocolRevenue: {
    [METRICS.UnstakingFees]: 'Total fees from 0.1% KHYPE unstaking fee.',
    [METRICS.PerformanceFees]: 'From 2026-04-09, 30% of performance fees (which is 10% staking rewards) are collected by protocol.',
  },
  HoldersRevenue: {
    [METRICS.TokenByBack]: 'From 2026-04-09, 70% of performance fees (which is 10% staking rewards) are used to by back KNTQ.',
  }
};

const KHYPE = '0xfD739d4e423301CE9385c1fb8850539D657C296D';
const KHYPE_STAKING_ACCOUNTANT = '0x9209648Ec9D448EF57116B73A2f081835643dc7A';
const KHYPE_TREASURY = '0x64bD77698Ab7C3Fd0a1F54497b228ED7a02098E3';
const exchangeRateAbi = 'function kHYPEToHYPE(uint256 kHYPEAmount) external view returns (uint256)'

async function fetch(options: FetchOptions): Promise<FetchResultV2> {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();

  const exchangeRateBefore = await options.fromApi.call({
    target: KHYPE_STAKING_ACCOUNTANT,
    abi: exchangeRateAbi,
    params: ['1000000000000000000'],
  }) / 1e18;
  const exchangeRateAfter = await options.toApi.call({
    target: KHYPE_STAKING_ACCOUNTANT,
    abi: exchangeRateAbi,
    params: ['1000000000000000000'],
  }) / 1e18;

  const totalSupply = await options.api.call({
    target: KHYPE,
    abi: 'uint256:totalSupply',
  }) / 1e18;

  // https://x.com/Kinetiq_xyz/status/2041888848595021866
  if (options.startOfDay < 1775692800) {
    dailyFees.addCGToken('hyperliquid', totalSupply * (exchangeRateAfter - exchangeRateBefore), METRICS.StakingRewards);
    dailySupplySideRevenue.addCGToken('hyperliquid', totalSupply * (exchangeRateAfter - exchangeRateBefore), METRICS.StakingRewardsToLPs);
  
    const unstakingFees = await addTokensReceived({
      options,
      token: KHYPE,
      target: KHYPE_TREASURY,
    });
    dailyFees.addBalances(unstakingFees, METRICS.UnstakingFees)
    dailyRevenue.addBalances(unstakingFees, METRICS.UnstakingFees)
    dailyProtocolRevenue.addBalances(unstakingFees, METRICS.UnstakingFees)
  } else {
    const yieldAfterFees = totalSupply * (exchangeRateAfter - exchangeRateBefore)
    const yieldTotal = yieldAfterFees / 0.9
    const performanceFees = yieldTotal - yieldAfterFees;
    const protocolRevenue = performanceFees * 0.3
    const holdersRevenue = performanceFees * 0.7
    
    dailyFees.addCGToken('hyperliquid', yieldTotal, METRICS.StakingRewards);
    dailyRevenue.addCGToken('hyperliquid', performanceFees, METRICS.PerformanceFees);
    dailySupplySideRevenue.addCGToken('hyperliquid', yieldAfterFees, METRICS.StakingRewardsToLPs);
    dailyProtocolRevenue.addCGToken('hyperliquid', protocolRevenue, METRICS.PerformanceFees);
    dailyHoldersRevenue.addCGToken('hyperliquid', holdersRevenue, METRICS.TokenByBack); 
  }

  return {
    dailyFees,
    dailyRevenue,
    dailySupplySideRevenue,
    dailyProtocolRevenue,
    dailyHoldersRevenue,
  };
}

const adapter: Adapter = {
  version: 2,
  pullHourly: true,
  adapter: {
    [CHAIN.HYPERLIQUID]: {
      fetch,
      start: '2025-07-14',
    },
  },
  methodology,
  breakdownMethodology,
};

export default adapter;
