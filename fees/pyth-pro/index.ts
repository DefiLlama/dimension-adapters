import ADDRESSES from '../../helpers/coreAssets.json'
import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryAllium } from "../../helpers/allium";

// Douro Labs is the official Pyth Pro data distributor
// Ordinary subscriptions are modeled as 60% to the Pyth DAO and 40% to Douro Labs.
// PYTH payments go to the Pyth DAO treasury in both periods.
// Before PIP-136, USDC payments also went to the Pyth DAO treasury.
// From PIP-136, USDC payments go to the Pythian Council Ops Multisig
// (GAdn7TZhszf5KTfwNRx3A2nP6KCRFEWucZubgdEqbJA2), which buys PYTH for the DAO.
const DOURO_LABS_WALLET = "2ru31e9g8RF2mSSNgTQ11QMb166NE6LJccmBqGJM8xxy";
const PYTH_DAO_WALLET = "Gx4MBPb1vqZLJajZmsKLg8fGw9ErhoKsR8LeKcCKFyak";
const PYTHIAN_COUNCIL_WALLET = "GAdn7TZhszf5KTfwNRx3A2nP6KCRFEWucZubgdEqbJA2";

// PIP-136: USDC DAO share is delivered to the Pythian Council instead of the DAO treasury
const PIP_136 = "2026-09-25";

// Token mints
const USDC_MINT = ADDRESSES.solana.USDC;
const PYTH_MINT = "HZ1JovNiVvGrGNiiYvEozEVgZ58xaU3RKwX8eACQBCt3";

const DAO_SHARE_PERCENT = 60n;
const TOTAL_PERCENT = 100n;

// The September 2026 distribution was sent to the DAO on October 5 by mistake,
// after PIP-136 switched the regular USDC recipient to the Council. Match only
// this transaction; do not delay the governance date or admit other DAO transfers.
// Source: https://forum.pyth.network/t/pyth-pro-douro-labs-report-september-2026/2720
const MISROUTED_USDC_TX = "4HmpUVkLMCTBZVoY2kmQaDpFkFTUUTpJ4bhrPwQeXTEKcdkmnXb8fhUv5Ha8kspL9xhvYaJYVjLE5DRcZSXNq6eZ";
const MISROUTED_USDC_TIME = 1791200707; // 2026-10-05 11:45:07 UTC
const MISROUTED_DAO_AMOUNT = 553_693_000_000n; // USDC, 6 decimals
const MISROUTED_GROSS_FEES = 916_471_000_000n; // Published mixed-product gross, 6 decimals

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  // Before PIP-136 both tokens settle at the DAO. From PIP-136, USDC settles at the Council.
  const usdcRecipient = options.dateString >= PIP_136
    ? PYTHIAN_COUNCIL_WALLET
    : PYTH_DAO_WALLET;

  // Note: Douro distributes in month N+1 for revenue earned in month N,
  // so DefiLlama data lags ~1 month vs actual earning period
  const subscriptionQuery = `
    SELECT
      mint as token_mint_address,
      TO_VARCHAR(COALESCE(SUM(TRY_TO_DECIMAL(raw_amount_str, 38, 0)), 0)) as total_amount
    FROM solana.assets.transfers
    WHERE block_timestamp >= TO_TIMESTAMP_NTZ(${options.startTimestamp}) AND block_timestamp < TO_TIMESTAMP_NTZ(${options.endTimestamp})
      AND mint IN ('${USDC_MINT}', '${PYTH_MINT}')
      AND from_address = '${DOURO_LABS_WALLET}'
      AND (
        (mint = '${USDC_MINT}' AND to_address = '${usdcRecipient}')
        OR (mint = '${PYTH_MINT}' AND to_address = '${PYTH_DAO_WALLET}')
      )
    GROUP BY mint
  `;

  const subscriptionRes = await queryAllium(subscriptionQuery);

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

  // Query this one known payment only in the fetch window containing its block time.
  // The ordinary query excludes its DAO recipient after PIP-136, so it cannot
  // be counted twice. LaaS has a 90% DAO share; do not gross this payment up at 60%.
  if (options.startTimestamp <= MISROUTED_USDC_TIME && MISROUTED_USDC_TIME < options.endTimestamp) {
    const exceptionQuery = `
      SELECT TO_VARCHAR(COALESCE(SUM(TRY_TO_DECIMAL(raw_amount_str, 38, 0)), 0)) AS total_amount
      FROM solana.assets.transfers
      WHERE block_timestamp >= TO_TIMESTAMP_NTZ(${options.startTimestamp}) AND block_timestamp < TO_TIMESTAMP_NTZ(${options.endTimestamp})
        AND txn_id = '${MISROUTED_USDC_TX}'
        AND mint = '${USDC_MINT}'
        AND from_address = '${DOURO_LABS_WALLET}'
        AND to_address = '${PYTH_DAO_WALLET}'
    `;
    const exceptionRes = await queryAllium(exceptionQuery);
    if (exceptionRes.length !== 1 || BigInt(exceptionRes[0].total_amount || 0) !== MISROUTED_DAO_AMOUNT)
      throw new Error("September 2026 Pyth Pro distribution does not match its documented on-chain transfer");

    dailyFees.add(USDC_MINT, MISROUTED_GROSS_FEES, "Pyth Pro Mixed Commercial Fees");
    dailyRevenue.add(USDC_MINT, MISROUTED_DAO_AMOUNT, "Pyth Pro Mixed Commercial Fees to Pyth DAO");
    dailySupplySideRevenue.add(USDC_MINT, MISROUTED_GROSS_FEES - MISROUTED_DAO_AMOUNT, "Pyth Pro Mixed Commercial Fees to Douro Labs");
  }

  return {
    dailyFees,
    dailyRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Fees: "Gross Pyth Pro fees inferred from on-chain distributions. The October 5, 2026 mixed Pyth Pro, LaaS, and Indices payment uses its published product allocation instead of a flat 60% DAO share.",
  Revenue: "Pyth DAO's share of Pyth Pro distributions, including the October 5, 2026 mixed payment that was sent to the DAO instead of the Council.",
  SupplySideRevenue: "Douro Labs' share of Pyth Pro distributions. The October 5, 2026 mixed payment uses the published gross less the DAO share; other payments are inferred at a 40% distributor share.",
}

const breakdownMethodology = {
  Fees: {
    "Subscription Fees": "Total Pyth Pro subscription revenue (100% gross), calculated from on-chain distributions.",
    "Pyth Pro Mixed Commercial Fees": "Gross Pyth Pro, LaaS, and Indices fees in the September 2026 distribution, paid on October 5.",
  },
  Revenue: {
    "Subscription Fees to Pyth DAO": "Pyth DAO's 60% share of Pyth Pro subscription revenue.",
    "Pyth Pro Mixed Commercial Fees to Pyth DAO": "DAO share of the September 2026 mixed distribution, paid on October 5.",
  },
  SupplySideRevenue: {
    "Subscription Fees to Douro Labs": "Douro Labs' 40% share as the official data distributor.",
    "Pyth Pro Mixed Commercial Fees to Douro Labs": "Gross less DAO share for the September 2026 mixed distribution, paid on October 5.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.SOLANA],
  start: "2025-01-01",
  dependencies: [Dependencies.ALLIUM],
  isExpensiveAdapter: true,
  methodology,
  breakdownMethodology,
  pullHourly: true,
};

export default adapter;
