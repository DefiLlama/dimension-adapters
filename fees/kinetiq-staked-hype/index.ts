import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";
import { Adapter, FetchOptions, FetchResultV2 } from "../../adapters/types";
import { addTokensReceived } from "../../helpers/token";

const methodology = {
  Fees: 'Total unstaking fees and rewards from staked HYPE.',
  Revenue: 'Total fee through 0.1% KHYPE unstaking fee before 2026-04-09, 10% performance fees after that.',
  ProtocolRevenue: 'All the revenue goes to the treasury.',
  SupplySideRevenue: 'All staking rewards distributed to HYPE stakers.',
};

const breakdownMethodology = {
  Fees: {
    [METRIC.STAKING_REWARDS]: 'Total staking rewards from staked HYPE.',
    [METRIC.DEPOSIT_WITHDRAW_FEES]: 'Total fees from 0.1% KHYPE unstaking fee.',
  },
  SupplySideRevenue: {
    [METRIC.STAKING_REWARDS]: 'All staking rewards distributed to HYPE stakers.',
  },
  Revenue: {
    [METRIC.DEPOSIT_WITHDRAW_FEES]: 'Total fees from 0.1% KHYPE unstaking fee.',
    [METRIC.PERFORMANCE_FEES]: 'Protocol takes 10% of staking rewards from 2026-04-09',
  },
  ProtocolRevenue: {
    [METRIC.DEPOSIT_WITHDRAW_FEES]: 'Total fees from 0.1% KHYPE unstaking fee.',
    [METRIC.PERFORMANCE_FEES]: 'Protocol takes 10% of staking rewards from 2026-04-09',
  },
};

const KHYPE = '0xfD739d4e423301CE9385c1fb8850539D657C296D';
const KHYPE_STAKING_ACCOUNTANT = '0x9209648Ec9D448EF57116B73A2f081835643dc7A';
const KHYPE_TREASURY = '0x64bD77698Ab7C3Fd0a1F54497b228ED7a02098E3';
const exchangeRateAbi = 'function kHYPEToHYPE(uint256 kHYPEAmount) external view returns (uint256)'

async function fetch(options: FetchOptions): Promise<FetchResultV2> {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

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
    dailyFees.addCGToken('hyperliquid', totalSupply * (exchangeRateAfter - exchangeRateBefore), METRIC.STAKING_REWARDS);
    dailySupplySideRevenue.addCGToken('hyperliquid', totalSupply * (exchangeRateAfter - exchangeRateBefore), METRIC.STAKING_REWARDS);
  
    const unstakingFees = await addTokensReceived({
      options,
      token: KHYPE,
      target: KHYPE_TREASURY,
    });
    dailyFees.addBalances(unstakingFees, METRIC.DEPOSIT_WITHDRAW_FEES)
    dailyRevenue.addBalances(unstakingFees, METRIC.DEPOSIT_WITHDRAW_FEES)
  } else {
    const yieldAfterFees = totalSupply * (exchangeRateAfter - exchangeRateBefore)
    const yieldTotal = yieldAfterFees / 0.9
    
    dailyFees.addCGToken('hyperliquid', yieldTotal, METRIC.STAKING_REWARDS);
    dailyRevenue.addCGToken('hyperliquid', yieldTotal - yieldAfterFees, METRIC.PERFORMANCE_FEES);
    dailySupplySideRevenue.addCGToken('hyperliquid', yieldAfterFees, METRIC.STAKING_REWARDS);
  }

  return {
    dailyFees,
    dailyRevenue,
    dailySupplySideRevenue,
    dailyProtocolRevenue: dailyRevenue,
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
