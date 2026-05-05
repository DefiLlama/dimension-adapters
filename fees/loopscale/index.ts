import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";
import { httpPost } from "../../utils/fetchURL";

// Sources:
// - Vault API endpoint used by the Loopscale app: https://tars.loopscale.com/v1/markets/lending_vaults/info
// - Vault mechanics, fees, rewards, and liquidation penalty docs:
//   https://docs.loopscale.com/protocol-concepts/loopscale-vaults
// - User-facing vault yield flow:
//   https://docs.loopscale.com/using-loopscale/earn
const API_URL = "https://tars.loopscale.com/v1/markets/lending_vaults/info";
const SECONDS_PER_DAY = 24 * 60 * 60;
const FEE_DENOMINATOR = 1e6;

interface LoopscaleVaultResponse {
  lendVaults: Array<{
    vaultRewardsSchedules?: Array<{
      rewardMint?: string;
      rewardStartTime?: string | number;
      rewardEndTime?: string | number;
      emissionsPerSecond?: string | number;
    }>;
    vaultStrategy?: {
      strategy?: {
        principalMint?: string;
        interestPerSecond?: string | number;
        interestFee?: string | number;
        closed?: boolean;
      };
    };
  }>;
  total?: number;
}

const toNumber = (value: string | number | undefined) => Number(value || 0);

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const now = Date.now() / 1000;

  // This endpoint is a current vault snapshot. It exposes each vault strategy's
  // current interestPerSecond and interestFee, plus curator-configured reward
  // schedules when includeRewards is enabled.
  const PAGE_SIZE = 50;
  const allVaults: LoopscaleVaultResponse["lendVaults"] = [];
  let page = 0;
  let total = Infinity;

  while (allVaults.length < total) {
    const response: LoopscaleVaultResponse = await httpPost(API_URL, {
      page,
      pageSize: PAGE_SIZE,
      includeRewards: true,
    });
    const vaults = response.lendVaults ?? [];
    allVaults.push(...vaults);
    total = response.total ?? allVaults.length;
    if (vaults.length < PAGE_SIZE) break; // no more pages
    page++;
  }

  allVaults.forEach(({ vaultRewardsSchedules, vaultStrategy }) => {
    const strategy = vaultStrategy?.strategy;
    if (strategy && !strategy.closed && strategy.principalMint) {
      // Loopscale vault yield is generated from borrower interest. interestFee
      // is the curator/manager share of interest earned, denominated in 1e6.
      const dailyInterest = toNumber(strategy.interestPerSecond) * SECONDS_PER_DAY;

      if (dailyInterest) {
        const revenueShare = toNumber(strategy.interestFee) / FEE_DENOMINATOR;
        const dailyProtocolInterest = dailyInterest * revenueShare;
        const dailyLenderInterest = dailyInterest - dailyProtocolInterest;

        dailyFees.add(strategy.principalMint, dailyInterest, METRIC.BORROW_INTEREST);
        dailyRevenue.add(strategy.principalMint, dailyProtocolInterest, METRIC.CURATORS_FEES);
        dailySupplySideRevenue.add(strategy.principalMint, dailyLenderInterest, METRIC.BORROW_INTEREST);
      }
    }

    vaultRewardsSchedules?.forEach((schedule) => {
      const rewardStartTime = toNumber(schedule.rewardStartTime);
      const rewardEndTime = toNumber(schedule.rewardEndTime);
      if (!schedule.rewardMint || now < rewardStartTime || now > rewardEndTime) return;

      // Curators can deposit reward tokens for proportional distribution to
      // suppliers. Count active emissions as supplier yield, not protocol revenue.
      const dailyRewards = toNumber(schedule.emissionsPerSecond) * SECONDS_PER_DAY;
      if (!dailyRewards) return;

      dailyFees.add(schedule.rewardMint, dailyRewards, METRIC.ASSETS_YIELDS);
      dailySupplySideRevenue.add(schedule.rewardMint, dailyRewards, METRIC.ASSETS_YIELDS);
    });
  });

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.SOLANA],
  runAtCurrTime: true,
  methodology: {
    Fees: "Loopscale Vault fees and yield from the current vault snapshot: borrower interest paid into vault strategies plus active curator-funded reward emissions. Loopscale docs describe Vaults as single-asset lending vaults where borrower interest flows back to depositors, and rewards schedules are curator-deposited tokens distributed to suppliers.",
    Revenue: "Curator/manager interest fees from Loopscale Vaults. Loopscale's Vault docs define Interest Fees as a curator-defined percentage of interest earned.",
    ProtocolRevenue: "Curator/manager interest fees from Loopscale Vaults, using each strategy's interestFee field from the vault API.",
    SupplySideRevenue: "Supplier yield from Loopscale Vaults: borrower interest remaining after curator/manager interest fees, plus active curator-funded reward emissions distributed to depositors.",
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.BORROW_INTEREST]: "Current daily run-rate borrower interest from Loopscale Vault strategies. Loopscale docs state that Vault capital is allocated to borrower-facing markets and interest from borrowers flows back to the Vault.",
      [METRIC.ASSETS_YIELDS]: "Current active reward tokens from Loopscale Vault reward schedules. Loopscale docs state that curators may deposit tokens to be automatically distributed proportionally to suppliers.",
    },
    Revenue: {
      [METRIC.CURATORS_FEES]: "Curator/manager share of Vault interest earned, calculated from each strategy's interestFee. Loopscale docs define Interest Fees as a percentage of interest earned.",
    },
    ProtocolRevenue: {
      [METRIC.CURATORS_FEES]: "Curator/manager share of Vault interest earned, calculated from each strategy's interestFee. Loopscale docs define Interest Fees as a percentage of interest earned.",
    },
    SupplySideRevenue: {
      [METRIC.BORROW_INTEREST]: "Borrower interest flowing back to Vault depositors after curator/manager interest fees.",
      [METRIC.ASSETS_YIELDS]: "Curator-funded reward tokens distributed to Vault depositors while the reward schedule is active.",
    },
  },
};

export default adapter;
