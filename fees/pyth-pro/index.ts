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

// Revenue split: DAO receives 60%, Douro Labs keeps 40%
const DAO_SHARE_PERCENT = 60n;
const TOTAL_PERCENT = 100n;

// Revenue attribution offset: Douro distributes in the first week of month N+1
// for revenue earned in month N. We shift queries forward by ~4 weeks to
// attribute revenue to the correct earning period.
const REVENUE_ATTRIBUTION_OFFSET_SECONDS = 28 * 24 * 60 * 60; // ~4 weeks

const fetch = async (_t: any, _a: any, options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  // Shift query window forward to capture distributions for the earning period
  // Example: Query for April 15 → looks at May 20, capturing the May 4th distribution
  const adjustedStart = options.startTimestamp + REVENUE_ATTRIBUTION_OFFSET_SECONDS;
  const adjustedEnd = options.endTimestamp + REVENUE_ATTRIBUTION_OFFSET_SECONDS;

  // Query USDC and PYTH transfers from Douro Labs to Pyth DAO
  const subscriptionQuery = `
    SELECT
      token_mint_address,
      COALESCE(SUM(amount), 0) as total_amount
    FROM tokens_solana.transfers
    WHERE block_time BETWEEN FROM_UNIXTIME(${adjustedStart}) AND FROM_UNIXTIME(${adjustedEnd})
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

    dailyFees.add(row.token_mint_address, grossAmount);
    dailyRevenue.add(row.token_mint_address, daoAmount);
    dailySupplySideRevenue.add(row.token_mint_address, douroAmount);
  }

  return {
    dailyFees,
    dailyRevenue,
    dailySupplySideRevenue,
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
    Fees: "Total Pyth Pro subscription revenue (100% gross). Douro Labs distributes the DAO's 60% share in the first week of the following month; revenue is attributed to the earning period.",
    Revenue: "Pyth DAO's 60% share of Pyth Pro subscription revenue.",
    SupplySideRevenue: "Douro Labs' 40% share as the official data distributor.",
  },
};

export default adapter;
