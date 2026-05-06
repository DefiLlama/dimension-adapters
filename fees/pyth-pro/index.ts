import {
  Dependencies,
  FetchOptions,
  SimpleAdapter,
} from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import ADDRESSES from "../../helpers/coreAssets.json";
import { queryDuneSql } from "../../helpers/dune";

// Douro Labs is the official Pyth Pro data distributor
// They pay 60% of subscription revenue to the Pyth DAO
// Note: These are wallet OWNER addresses, not token account addresses
// Dune's tokens_solana.transfers uses owner addresses in from_owner/to_owner fields
const DOURO_LABS_WALLET = "2ru31e9g8RF2mSSNgTQ11QMb166NE6LJccmBqGJM8xxy";
const PYTH_DAO_WALLET = "Gx4MBPb1vqZLJajZmsKLg8fGw9ErhoKsR8LeKcCKFyak";

// Token mints
const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const PYTH_MINT = "HZ1JovNiVvGrGNiiYvEozEVgZ58xaU3RKwX8eACQBCt3";

const fetch = async (_t: any, _a: any, options: FetchOptions) => {
  const dailyFees = options.createBalances();

  // Query both USDC and PYTH transfers from Douro Labs wallet to Pyth DAO wallet
  // Per CO-PIP-104, Douro Labs can pay in PYTH tokens and/or USDC
  // April 2026 was the first PYTH-only distribution
  const query = `
    SELECT
      token_mint_address,
      SUM(amount) as total_amount
    FROM tokens_solana.transfers
    WHERE block_time BETWEEN FROM_UNIXTIME(${options.startTimestamp}) AND FROM_UNIXTIME(${options.endTimestamp})
      AND token_mint_address IN ('${USDC_MINT}', '${PYTH_MINT}')
      AND from_owner = '${DOURO_LABS_WALLET}'
      AND to_owner = '${PYTH_DAO_WALLET}'
    GROUP BY token_mint_address
  `;

  const res = await queryDuneSql(options, query);

  for (const row of res) {
    const amount = row?.total_amount || 0;
    if (amount > 0) {
      if (row.token_mint_address === USDC_MINT) {
        // USDC has 6 decimals
        dailyFees.add(ADDRESSES.solana.USDC, amount);
      } else if (row.token_mint_address === PYTH_MINT) {
        // PYTH has 6 decimals
        dailyFees.addCGToken("pyth-network", amount / 1e6);
      }
    }
  }

  // Total fees = revenue / 0.6 (since Douro keeps 40%)
  // But we only track what reaches the DAO as revenue
  return {
    dailyFees: dailyFees,
    dailyRevenue: dailyFees,
  };
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.SOLANA],
  start: "2025-01-01",
  dependencies: [Dependencies.DUNE],
  methodology: {
    Fees: "USDC and/or PYTH payments from Douro Labs (Pyth Pro data distributor) to Pyth DAO. Per CO-PIP-104, payments can be made in PYTH tokens, USDC, or a combination.",
    Revenue:
      "Pyth DAO receives 60% of Pyth Pro subscription revenue from Douro Labs",
  },
};

export default adapter;
