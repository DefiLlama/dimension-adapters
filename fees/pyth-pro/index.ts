import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";

// Douro Labs is the official Pyth Pro data distributor
// Revenue split: Douro Labs keeps 40%, Pyth DAO receives 60%
const DOURO_LABS_WALLET = "2ru31e9g8RF2mSSNgTQ11QMb166NE6LJccmBqGJM8xxy";
const PYTH_DAO_WALLET = "Gx4MBPb1vqZLJajZmsKLg8fGw9ErhoKsR8LeKcCKFyak";

// Token mints
const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const PYTH_MINT = "HZ1JovNiVvGrGNiiYvEozEVgZ58xaU3RKwX8eACQBCt3";

const DAO_SHARE_PERCENT = 60n;
const TOTAL_PERCENT = 100n;

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  // Query USDC and PYTH transfers from Douro Labs to Pyth DAO
  // Note: Douro distributes in month N+1 for revenue earned in month N,
  // so DefiLlama data lags ~1 month vs actual earning period
  const subscriptionQuery = `
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

  const subscriptionRes = await queryDuneSql(options, subscriptionQuery);

  for (const row of subscriptionRes) {
    const daoAmount = BigInt(row.total_amount || 0);
    if (daoAmount === 0n) continue;

    // DAO receives 60%, so gross = daoAmount * 100 / 60
    const grossAmount = (daoAmount * TOTAL_PERCENT) / DAO_SHARE_PERCENT;
    const douroAmount = grossAmount - daoAmount;

    dailyFees.add(row.token_mint_address, grossAmount, "Subscription Fees");
    dailyRevenue.add(row.token_mint_address, daoAmount, "Subscription Fees to Pyth DAO");
    dailySupplySideRevenue.add(row.token_mint_address, douroAmount, "Subscription Fees to Douro Labs");
  }

  return {
    dailyFees,
    dailyRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Fees: "Total Pyth Pro subscription revenue (100% gross), calculated from on-chain distributions.",
  Revenue: "Pyth DAO's 60% share of Pyth Pro subscription revenue.",
  SupplySideRevenue: "Douro Labs' 40% share as the official data distributor.",
}

const breakdownMethodology = {
  Fees: {
    "Subscription Fees": "Total Pyth Pro subscription revenue (100% gross), calculated from on-chain distributions.",
  },
  Revenue: {
    "Subscription Fees to Pyth DAO": "Pyth DAO's 60% share of Pyth Pro subscription revenue.",
  },
  SupplySideRevenue: {
    "Subscription Fees to Douro Labs": "Douro Labs' 40% share as the official data distributor.",
  },
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.SOLANA],
  start: "2025-01-01",
  dependencies: [Dependencies.DUNE],
  isExpensiveAdapter: true,
  methodology,
  breakdownMethodology,
};

export default adapter;
