import { FetchOptions, SimpleAdapter,Dependencies } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";

const WYLDS_MINT = "8fr7WGTVFszfyNWRMXj6fRjZZAnDwmXwEpCrtzmUkdih";

const VAULT_STAKE_WYLDS_ACCOUNT = "FvkbfMm98jefJWrqkvXvsSZ9RFaRBae8k6c1jaYA5vY3";

const VAULT_STAKE_OWNER = "DT7z9w9fGJ6sH7vmGbPCa5JLi2xp6XPrL61z2gctzmHb";

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const query = `
    SELECT
      SUM(amount_display) AS total_minted
    FROM tokens_solana.transfers
    WHERE
      token_mint_address = '${WYLDS_MINT}'
      AND action = 'mint'
      AND to_token_account = '${VAULT_STAKE_WYLDS_ACCOUNT}'
      AND to_owner = '${VAULT_STAKE_OWNER}'
      AND TIME_RANGE
  `;

  const result = await queryDuneSql(options, query);
  const totalMinted = Number(result?.[0]?.total_minted ?? 0);

  if (totalMinted > 0) {
    dailyFees.addUSDValue(totalMinted, "HELOC Lending Yield");
    dailySupplySideRevenue.addUSDValue(totalMinted, "HELOC Lending Yield To Holders");
  }

  return {
    dailyFees,
    dailySupplySideRevenue,
    dailyRevenue: options.createBalances(),
  };
};

const methodology = {
  Fees: "wYLDS tokens minted into the vault-stake account via publish_rewards, representing real-world yield from Figure's HELOC lending pools distributed to PRIME stakers.",
  SupplySideRevenue: "All minted wYLDS accrues to PRIME stakers by increasing the wYLDS-per-PRIME exchange rate.",
  Revenue: "Hastra takes no on-chain protocol fee cut. Figure monetises via off-chain lending spreads on HELOCs.",
};

const breakdownMethodology = {
  Fees: {
    "HELOC Lending Yield": "wYLDS minted hourly into the vault-stake account via publish_rewards CPI from vault-mint, funded by Figure's Demo Prime HELOC lending operations.",
  },
  SupplySideRevenue: {
    "HELOC Lending Yield To Holders": "All minted wYLDS increase the wYLDS-per-PRIME ratio, fully accruing to PRIME stakers.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.SOLANA],
  start: "2025-11-21",
  isExpensiveAdapter: true,
  dependencies: [Dependencies.DUNE],
  methodology,
  breakdownMethodology,
};

export default adapter;