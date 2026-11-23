import { FetchOptions, SimpleAdapter, Dependencies } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryAllium } from "../../helpers/allium";
import { METRIC } from "../../helpers/metrics";

// --- Solana ---
const WYLDS_MINT = "8fr7WGTVFszfyNWRMXj6fRjZZAnDwmXwEpCrtzmUkdih";
// wYLDS account of each staking vault => its owner
const VAULT_STAKE_ACCOUNTS: Record<string, string> = {
    "FvkbfMm98jefJWrqkvXvsSZ9RFaRBae8k6c1jaYA5vY3": "DT7z9w9fGJ6sH7vmGbPCa5JLi2xp6XPrL61z2gctzmHb", // PRIME
    "GtWPVP3KPTJC8z9wPLAop4mPp9jZiRKzL8deDD4PfQ7C": "3i8TH5E4Jj7CXTF9VbwhVuRkDGYLAC71T8RyRfGBc4Go", // AUTO
    "HRpRWaGHqNWYuwP2r9vwjJKZmV5uf2DDoMX2amh5AVjW": "32KSgvTw4NtTFD462bfbEu9tMoQr2JZ9Vf6BWRzzJsvq", // SMB
};

// --- Ethereum ---
// Yield = wYLDS minted (Transfer from 0x0) into the PRIME, AUTO and SMB staking contracts.
// Mints to other addresses are new issuance, not yield, so filter to staking only.
const ETH_WYLDS = "0x6aD038cA6C04e885630851278ca0a856Ad9a66Cc"; // 6 decimals
const ETH_STAKING = [
    "0x19ebb35279A16207Ec4ba82799CC64715065F7F6", // PRIME
    "0x997E2Efbce91D170B00EA402e35a66C887EE1da9", // AUTO
    "0xBd49537Cc9105E8c1651Ed12b94cD9A3D79Bf3d9", // SMB
];

const fetchSolana = async (options: FetchOptions) => {
    const dailyFees = options.createBalances();

    const query = `
        SELECT
            COALESCE(SUM(amount), 0) AS total_minted
        FROM solana.assets.transfers
        WHERE
            mint = '${WYLDS_MINT}'
            AND type IN ('mintTo', 'mintToChecked')
            AND token_acc_to IN ('${Object.keys(VAULT_STAKE_ACCOUNTS).join("', '")}')
            AND to_address IN ('${Object.values(VAULT_STAKE_ACCOUNTS).join("', '")}')
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
        targets: ETH_STAKING,
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
    Fees: "wYLDS tokens minted into the PRIME, AUTO and SMB staking vaults via the publish_rewards reward stream (Solana vault-stake accounts / Ethereum staking contracts), net of Hastra's 50 bps fee.",
    SupplySideRevenue: "Yields accumulated based on staked wYLDS holdings.",
    Revenue: "Zero: the minted rewards all go to stakers. Hastra states its yield is net of a 50 bps fee, which is not visible in these mints and is in neither Fees nor Revenue. Figure's off-chain lending spreads are not counted either.",
};

const breakdownMethodology = {
    Fees: {
        [METRIC.ASSETS_YIELDS]: "wYLDS minted hourly into the PRIME, AUTO and SMB staking vaults (Solana vault-stake accounts / Ethereum staking contracts) via the publish_rewards reward stream, funded by Figure's Democratized Prime lending pools: home equity lines (PRIME), consumer auto loans (AUTO) and small-business loans (SMB). Net of Hastra's 50 bps fee. New-issuance mints to other addresses are excluded.",
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
