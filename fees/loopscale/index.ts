import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";
import { httpPost } from "../../utils/fetchURL";
import { sleep } from "../../utils/utils";

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
        await sleep(3000);
    }

    allVaults.forEach(({ vaultRewardsSchedules, vaultStrategy }) => {
        const strategy = vaultStrategy?.strategy;
        if (strategy && !strategy.closed && strategy.principalMint) {
            // Loopscale vault yield is generated from borrower interest. interestFee
            // is the curator/manager share of interest earned, denominated in 1e6.
            const dailyInterest = toNumber(strategy.interestPerSecond) * SECONDS_PER_DAY;

            if (dailyInterest) {
                const curatorFeeRate = toNumber(strategy.interestFee) / FEE_DENOMINATOR;
                const dailyCuratorFee = dailyInterest * curatorFeeRate;
                const dailyBorrowerInterest = dailyInterest - dailyCuratorFee;

                dailyFees.add(strategy.principalMint, dailyInterest, METRIC.BORROW_INTEREST);
                dailySupplySideRevenue.add(strategy.principalMint, dailyCuratorFee, METRIC.CURATORS_FEES);
                dailySupplySideRevenue.add(strategy.principalMint, dailyBorrowerInterest, METRIC.BORROW_INTEREST);
            }
        }
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
        Fees: "Loopscale Vault fees and yield from the current vault snapshot: borrower interest paid into vault strategies",
        Revenue: "No revenue from Loopscale Vaults",
        ProtocolRevenue: "No revenue from Loopscale Vaults",
        SupplySideRevenue: "Includes borrower interest and curator fees",
    },
    breakdownMethodology: {
        Fees: {
            [METRIC.BORROW_INTEREST]: "Current daily run-rate borrower interest from Loopscale Vault strategies. Loopscale docs state that Vault capital is allocated to borrower-facing markets and interest from borrowers flows back to the Vault.",
        },
        SupplySideRevenue: {
            [METRIC.BORROW_INTEREST]: "Borrower interest flowing back to Vault depositors after curator fees.",
            [METRIC.CURATORS_FEES]: "Curator fees from Loopscale Vault strategies",
        },
    },
};

export default adapter;
