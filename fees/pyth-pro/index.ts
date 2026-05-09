import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";

// Douro Labs is the official Pyth Pro data distributor
// They pay 60% of subscription revenue to the Pyth DAO
// Note: These are wallet OWNER addresses, not token account addresses
// Dune's tokens_solana.transfers uses owner addresses in from_owner/to_owner fields
const DOURO_LABS_WALLET = "2ru31e9g8RF2mSSNgTQ11QMb166NE6LJccmBqGJM8xxy";
const PYTH_DAO_WALLET = "Gx4MBPb1vqZLJajZmsKLg8fGw9ErhoKsR8LeKcCKFyak";
const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const PYTH_MINT = "HZ1JovNiVvGrGNiiYvEozEVgZ58xaU3RKwX8eACQBCt3";

const fetch = async (_t: any, _a: any, options: FetchOptions) => {
  const dailyFees = options.createBalances();

  // Query USDC transfers from Douro Labs wallet to Pyth DAO wallet
  const query = `
    SELECT
      token_mint_address,
      COALESCE(SUM(amount), 0) as total_amount
    FROM tokens_solana.transfers
    WHERE block_time BETWEEN FROM_UNIXTIME(${options.startTimestamp}) AND FROM_UNIXTIME(${options.endTimestamp})
      AND token_mint_address IN ('${USDC_MINT}', '${PYTH_MINT}')
      AND from_owner = '${DOURO_LABS_WALLET}'
      AND to_owner = '${PYTH_DAO_WALLET}'
      GROUP BY token_mint_address
  `;

  const res = await queryDuneSql(options, query);

  for (const tokenFees of res) {
    dailyFees.add(tokenFees.token_mint_address, tokenFees.total_amount);
  }

  // Total fees = revenue / 0.6 (since Douro keeps 40%)
  // But we only track what reaches the DAO as revenue
  return {
    dailyFees: dailyFees, // We report received amount as fees
    dailyRevenue: dailyFees,
  };
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.SOLANA],
  start: "2025-01-01",
  dependencies: [Dependencies.DUNE],
  isExpensiveAdapter: true,
  methodology: {
    Fees: "60% of Pyth Pro subscription revenue from Douro Labs, paid in USDC and PYTH",
    Revenue: "60% of Pyth Pro subscription revenue from Douro Labs, paid in USDC and PYTH",
  },
};

export default adapter;
