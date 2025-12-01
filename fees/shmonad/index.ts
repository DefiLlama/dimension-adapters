import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

// shMonad liquid staking contract on Monad
const SHMONAD_CONTRACT = "0x1B68626dCa36c7fE922fD2d55E4f631d962dE19c";

// contract functions
const getAtomicCapitalAbi = "function getAtomicCapital() view returns (uint256 allocated, uint256 distributed)";
const getCurrentAssetsAbi = "function getCurrentAssets() view returns (uint256)";
const getWorkingCapitalAbi = "function getWorkingCapital() view returns (uint256 staked, uint256 reserved)";
const totalSupplyAbi = "function totalSupply() view returns (uint256)";

/**
     * @notice Retrieves the rolling global liabilities tracked by StakeTracker.
     * @return rewardsPayable The MON amount reserved for rewards payouts.
     * @return redemptionsPayable The MON amount pending redemption settlement.
     * @return totalZeroYieldPayable The MON amount earmarked for zero-yield obligations (e.g., commission accruals).
     * https://github.com/FastLane-Labs/fastlane-contracts/blob/485e9305b251089b94f62ef22b7ab9a74e0d32c3/src/shmonad/Storage.sol#L157
*/
const globalLiabilitiesAbi = "function globalLiabilities() view returns (uint128 rewardsPayable, uint128 redemptionsPayable, uint128 totalZeroYieldPayable)";

/**
 * Calculate Equity (Net Asset Value) using the formula described in the documentation:
 * Equity = (Total Assets) - (Total Liabilities)
 * Total Assets = staked + reserved + allocated + currentAssets
 * Total Liabilities = rewardsPayable + redemptionsPayable + totalZeroYieldPayable
 */

// https://docs.shmonad.xyz/exchange-rate
// Equity = What the Protocol Owns − What the Protocol Owes
// Equity = Total Staked MON + Available MON − (Pending Withdrawals + Validator Rewards Payable + Zero-Yield Deposits)

function calculateEquity(
  workingCapital: { staked: bigint; reserved: bigint },
  atomicCapital: { allocated: bigint; distributed: bigint },
  currentAssets: bigint,
  liabilities: { rewardsPayable: bigint; redemptionsPayable: bigint; totalZeroYieldPayable: bigint }
): bigint {
  const totalAssets =
    workingCapital.staked +
    workingCapital.reserved +
    atomicCapital.allocated +
    currentAssets;

  const totalLiabilities =
    liabilities.rewardsPayable +
    liabilities.redemptionsPayable +
    liabilities.totalZeroYieldPayable;

  return totalAssets - totalLiabilities;
}

const getFetch = () => {
  return async (options: FetchOptions) => {
    const dailyFees = options.createBalances();
    const dailyProtocolRevenue = options.createBalances();
    const dailySupplySideRevenue = options.createBalances();

    try {
      //  FETCH CONTRACT STATE AT START OF PERIOD
      const [workingBefore, atomicBefore, currentBefore, liabilitiesBefore, supplyBefore] = await Promise.all([
        options.fromApi.call({ target: SHMONAD_CONTRACT, abi: getWorkingCapitalAbi }),
        options.fromApi.call({ target: SHMONAD_CONTRACT, abi: getAtomicCapitalAbi }),
        options.fromApi.call({ target: SHMONAD_CONTRACT, abi: getCurrentAssetsAbi }),
        options.fromApi.call({ target: SHMONAD_CONTRACT, abi: globalLiabilitiesAbi }),
        options.fromApi.call({ target: SHMONAD_CONTRACT, abi: totalSupplyAbi }),
      ]);

      // FETCH CONTRACT STATE AT END OF PERIOD
      const [workingAfter, atomicAfter, currentAfter, liabilitiesAfter, supplyAfter] = await Promise.all([
        options.toApi.call({ target: SHMONAD_CONTRACT, abi: getWorkingCapitalAbi }),
        options.toApi.call({ target: SHMONAD_CONTRACT, abi: getAtomicCapitalAbi }),
        options.toApi.call({ target: SHMONAD_CONTRACT, abi: getCurrentAssetsAbi }),
        options.toApi.call({ target: SHMONAD_CONTRACT, abi: globalLiabilitiesAbi }),
        options.toApi.call({ target: SHMONAD_CONTRACT, abi: totalSupplyAbi }),
      ]);

      // CONVERT TO BIGINT
      // Helper function to safely convert contract return objects to BigInt structure.
      const toBigInt = (obj: any) => ({
        staked: BigInt(obj?.staked || 0), 
        reserved: BigInt(obj?.reserved || 0),
        allocated: BigInt(obj?.allocated || 0), 
        distributed: BigInt(obj?.distributed || 0),
        rewardsPayable: BigInt(obj?.rewardsPayable || 0), 
        redemptionsPayable: BigInt(obj?.redemptionsPayable || 0),
        totalZeroYieldPayable: BigInt(obj?.totalZeroYieldPayable || 0),
      });

      const startPeriodState = { 
        working: toBigInt(workingBefore), 
        atomic: toBigInt(atomicBefore), 
        current: BigInt(currentBefore || 0), 
        liabilities: toBigInt(liabilitiesBefore),
        supply: BigInt(supplyBefore || 0)
      };
      
      const endPeriodState = { 
        working: toBigInt(workingAfter), 
        atomic: toBigInt(atomicAfter), 
        current: BigInt(currentAfter || 0), 
        liabilities: toBigInt(liabilitiesAfter),
        supply: BigInt(supplyAfter || 0)
      };

      // CALCULATE EQUITY
      const equityBefore = calculateEquity(
        startPeriodState.working, 
        startPeriodState.atomic, 
        startPeriodState.current, 
        startPeriodState.liabilities
      );
      const equityAfter = calculateEquity(
        endPeriodState.working, 
        endPeriodState.atomic, 
        endPeriodState.current, 
        endPeriodState.liabilities
      );

      let totalRewards = 0n;

      if (startPeriodState.supply > 0n && endPeriodState.supply > 0n) {
        // Calculate exchange rates (scaled by 10^18 to maintain precision during division)
        const exchangeRateBefore = equityBefore * 10n**18n / startPeriodState.supply;
        const exchangeRateAfter = equityAfter * 10n**18n / endPeriodState.supply;
     
        if (exchangeRateAfter > exchangeRateBefore) {
            // Unscale the result
            totalRewards = ((exchangeRateAfter - exchangeRateBefore) * startPeriodState.supply) / 10n**18n;
        }
      }

      if (totalRewards > 0n) {
        dailyFees.addGasToken(totalRewards);

        // Protocol revenue = 5%
        const protocolRevenue = (totalRewards * 5n) / 100n;
        dailyProtocolRevenue.addGasToken(protocolRevenue);

        // Supply-side revenue = 95%
        const supplySideRevenue = totalRewards - protocolRevenue;
        dailySupplySideRevenue.addGasToken(supplySideRevenue);
      }

      return {
        dailyFees,
        dailyRevenue: dailyFees,
        dailyProtocolRevenue,
        dailySupplySideRevenue,
        dailyHoldersRevenue: dailySupplySideRevenue,
      };
    } catch (error) {
      console.error("Error fetching shMonad fee data:", error);
      return {
        dailyFees,
        dailyRevenue: dailyFees,
        dailyProtocolRevenue,
        dailySupplySideRevenue,
      };
    }
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.MONAD]: {
      fetch: getFetch(),
      start: "2024-11-01",
    },
  },
  methodology: {
    Fees: "Total fees calculated from exchange rate appreciation (equity per shMON token). Includes staking rewards from Monad validators, MEV, and atomic unstake fees. Equity is calculated as Total Assets minus detailed Liabilities (rewards payable, pending redemptions, and zero-yield obligations).",
    Revenue: "Protocol revenue = 5% of total equity growth.",
    UserFees: "Users pay atomic unstake fees for instant withdrawals.",
    ProtocolRevenue: "5% commission on staking and MEV revenue.",
    SupplySideRevenue: "95% of staking/MEV + 100% atomic fees accrue to shMON holders.",
    HoldersRevenue: "All supply-side revenue accrues to shMON holders via increasing MON value per shMON token.",
  },
};

export default adapter;