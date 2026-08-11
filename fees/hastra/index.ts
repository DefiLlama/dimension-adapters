import { FetchOptions, SimpleAdapter, Dependencies } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryAllium } from "../../helpers/allium";
import { METRIC } from "../../helpers/metrics";

// --- Solana ---
const WYLDS_MINT = "8fr7WGTVFszfyNWRMXj6fRjZZAnDwmXwEpCrtzmUkdih";
const VAULT_STAKE_WYLDS_ACCOUNT = "FvkbfMm98jefJWrqkvXvsSZ9RFaRBae8k6c1jaYA5vY3";
const VAULT_STAKE_OWNER = "DT7z9w9fGJ6sH7vmGbPCa5JLi2xp6XPrL61z2gctzmHb";

// --- Ethereum ---
// Yield = wYLDS minted (Transfer from 0x0) into the PRIME staking contract.
// Mints to other addresses are new issuance, not yield, so filter to staking only.
const ETH_WYLDS = "0x6aD038cA6C04e885630851278ca0a856Ad9a66Cc"; // 6 decimals
const ETH_STAKING = "0x19ebb35279A16207Ec4ba82799CC64715065F7F6";

const fetchSolana = async (options: FetchOptions) => {
    const dailyFees = options.createBalances();

    const query = `
        SELECT
            COALESCE(SUM(amount), 0) AS total_minted
        FROM solana.assets.transfers
        WHERE
            mint = '${WYLDS_MINT}'
            AND type IN ('mintTo', 'mintToChecked')
            AND token_acc_to = '${VAULT_STAKE_WYLDS_ACCOUNT}'
            AND to_address = '${VAULT_STAKE_OWNER}'
            AND block_timestamp >= TO_TIMESTAMP_NTZ(${options.startTimestamp})
            AND block_timestamp < TO_TIMESTAMP_NTZ(${options.endTimestamp})
  `;

    const result = await queryAllium(query);
    const dailyYields = result[0].total_minted;

    dailyFees.addUSDValue(dailyYields, METRIC.ASSETS_YIELDS);

    return {
        dailyFees,
        dailySupplySideRevenue: dailyFees,
        dailyRevenue: 0,
    };
};

const fetchEthereum = async (options: FetchOptions) => {
    const dailyFees = options.createBalances();

    const rewardDistributionLogs = await options.getLogs({
        target: ETH_STAKING,
        eventAbi: "event RewardsDistributed (uint256 amount, uint256 timestamp)",
    });

    for (const log of rewardDistributionLogs) {
        dailyFees.add(ETH_WYLDS, log.amount, METRIC.ASSETS_YIELDS);
    }

    return {
        dailyFees,
        dailySupplySideRevenue: dailyFees,
        dailyRevenue: 0,
    };
};

const methodology = {
    Fees: "wYLDS tokens minted into the PRIME staking vault via the publish_rewards reward stream (Solana vault-stake account / Ethereum staking contract).",
    SupplySideRevenue: "Yields accumulated based on staked wYLDS holdings.",
    Revenue: "Hastra takes no on-chain protocol fee cut. Figure monetises via off-chain lending spreads on HELOCs.",
};

const breakdownMethodology = {
    Fees: {
        [METRIC.ASSETS_YIELDS]: "wYLDS minted hourly into the PRIME staking vault (Solana vault-stake account / Ethereum staking contract) via the publish_rewards reward stream, funded by Figure's Demo Prime HELOC lending operations. New-issuance mints to other addresses are excluded.",
    },
    SupplySideRevenue: {
        [METRIC.ASSETS_YIELDS]: "Yields accumulated based on staked wYLDS holdings.",
    },
};

const adapter: SimpleAdapter = {
    version: 2,
    adapter: {
      [CHAIN.SOLANA]: { start: '2025-11-21', fetch: fetchSolana},
      [CHAIN.ETHEREUM]: { start: '2026-04-17', fetch: fetchEthereum},
    },
    isExpensiveAdapter: true,
    dependencies: [Dependencies.ALLIUM],
    methodology,
    breakdownMethodology,
    pullHourly: true,
};

export default adapter;
