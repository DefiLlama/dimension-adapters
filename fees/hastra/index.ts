import { FetchOptions, SimpleAdapter, Dependencies } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";
import { METRIC } from "../../helpers/metrics";

const WYLDS_MINT = "8fr7WGTVFszfyNWRMXj6fRjZZAnDwmXwEpCrtzmUkdih";

const VAULT_STAKE_WYLDS_ACCOUNT = "FvkbfMm98jefJWrqkvXvsSZ9RFaRBae8k6c1jaYA5vY3";

const VAULT_STAKE_OWNER = "DT7z9w9fGJ6sH7vmGbPCa5JLi2xp6XPrL61z2gctzmHb";

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
    const dailyFees = options.createBalances();

    const query = `
        SELECT
            COALESCE(SUM(amount_display), 0) AS total_minted
        FROM tokens_solana.transfers
        WHERE
            token_mint_address = '${WYLDS_MINT}'
            AND action = 'mint'
            AND to_token_account = '${VAULT_STAKE_WYLDS_ACCOUNT}'
            AND to_owner = '${VAULT_STAKE_OWNER}'
            AND TIME_RANGE
  `;

    const result = await queryDuneSql(options, query);
    const dailyYields = result[0].total_minted;

    dailyFees.addUSDValue(dailyYields, METRIC.ASSETS_YIELDS);

    return {
        dailyFees,
        dailySupplySideRevenue: dailyFees
    };
};

const methodology = {
    Fees: "wYLDS tokens minted into the vault-stake account via publish_rewards",
    SupplySideRevenue: "Yields accumulated based on wYLDS holdings",
    Revenue: "Hastra takes no on-chain protocol fee cut. Figure monetises via off-chain lending spreads on HELOCs.",
};

const breakdownMethodology = {
    Fees: {
        [METRIC.ASSETS_YIELDS]: "wYLDS minted hourly into the vault-stake account via publish_rewards CPI from vault-mint, funded by Figure's Demo Prime HELOC lending operations.",
    },
    SupplySideRevenue: {
        [METRIC.ASSETS_YIELDS]: "Yields accumulated based on wYLDS holdings",
    },
};

const adapter: SimpleAdapter = {
    version: 1,
    fetch,
    chains: [CHAIN.SOLANA],
    start: "2025-11-21",
    isExpensiveAdapter: true,
    dependencies: [Dependencies.DUNE],
    methodology,
    breakdownMethodology,
};

export default adapter;
