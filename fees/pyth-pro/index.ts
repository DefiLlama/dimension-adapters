import ADDRESSES from '../../helpers/coreAssets.json'
import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryAllium } from "../../helpers/allium";

// Douro Labs is the official Pyth Pro data distributor.
// The Pyth Pro umbrella includes Pyth Pro subscriptions, LaaS, and Indices.
// Revenue shares are product-specific: Pyth Pro and Indices use 60/40;
// LaaS uses 90/10.
const DOURO_LABS_WALLET = "2ru31e9g8RF2mSSNgTQ11QMb166NE6LJccmBqGJM8xxy";
const PYTH_DAO_WALLET = "Gx4MBPb1vqZLJajZmsKLg8fGw9ErhoKsR8LeKcCKFyak";
const PYTHIAN_COUNCIL_WALLET = "GAdn7TZhszf5KTfwNRx3A2nP6KCRFEWucZubgdEqbJA2";

// PIP-136: USDC DAO share is delivered to the Pythian Council instead of the DAO treasury.
const PIP_136 = "2026-09-25";

// Source-backed mixed distributions. All three streams remain inside the public
// Pyth Pro umbrella listing; these allocations only preserve their different shares.
// August source: https://forum.pyth.network/t/pyth-pro-douro-labs-report-august-2026/2695
// September source: https://forum.pyth.network/t/pyth-pro-douro-labs-report-september-2026/2720
const MIXED_DISTRIBUTIONS = [
  {
    txnId: "3e5rijGDRxiBHXdXz1Q6mSKKtd6UXibR9PibDNc2Z5v9dh1GsCALnzeF26g8RKwjZ7zNsnap1tMAZQCwrL8QU6cY",
    startTimestamp: 1788825600, // 2026-09-08 00:00 UTC
    endTimestamp: 1788912000,   // 2026-09-09 00:00 UTC
    allocations: [
      {
        feesLabel: "Pyth Pro Subscription Fees",
        daoAmount: 405_560_000_000n,
        daoSharePercent: 60n,
      },
      {
        feesLabel: "Pyth Pro LaaS Fees",
        daoAmount: 10_980_000_000n,
        daoSharePercent: 90n,
      },
      {
        feesLabel: "Pyth Pro Indices Fees",
        daoAmount: 17_200_000_000n,
        daoSharePercent: 60n,
      },
    ],
  },
  {
    txnId: "4HmpUVkLMCTBZVoY2kmQaDpFkFTUUTpJ4bhrPwQeXTEKcdkmnXb8fhUv5Ha8kspL9xhvYaJYVjLE5DRcZSXNq6eZ",
    startTimestamp: 1791158400, // 2026-10-05 00:00 UTC
    endTimestamp: 1791244800,   // 2026-10-06 00:00 UTC
    allocations: [
      {
        feesLabel: "Pyth Pro Subscription Fees",
        daoAmount: 460_850_000_000n,
        daoSharePercent: 60n,
      },
      {
        feesLabel: "Pyth Pro LaaS Fees",
        daoAmount: 11_430_000_000n,
        daoSharePercent: 90n,
      },
      {
        feesLabel: "Pyth Pro Indices Fees",
        daoAmount: 81_413_000_000n,
        daoSharePercent: 60n,
      },
    ],
  },
] as const;

const MIXED_DISTRIBUTION_TX_IDS = MIXED_DISTRIBUTIONS
  .map(({ txnId }) => `'${txnId}'`)
  .join(", ");

// Token mints
const USDC_MINT = ADDRESSES.solana.USDC;
const PYTH_MINT = "HZ1JovNiVvGrGNiiYvEozEVgZ58xaU3RKwX8eACQBCt3";

const DAO_SHARE_PERCENT = 60n;
const TOTAL_PERCENT = 100n;

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const addDistribution = (
    token: string,
    daoAmount: bigint,
    daoSharePercent: bigint,
    feesLabel: string,
    revenueLabel: string,
    supplySideLabel: string,
    isProtocolRevenue: boolean,
  ) => {
    const grossAmount = (daoAmount * TOTAL_PERCENT) / daoSharePercent;
    const douroAmount = grossAmount - daoAmount;

    dailyFees.add(token, grossAmount, feesLabel);
    dailyRevenue.add(token, daoAmount, revenueLabel);
    dailySupplySideRevenue.add(token, douroAmount, supplySideLabel);

    if (isProtocolRevenue) {
      dailyProtocolRevenue.add(token, daoAmount, revenueLabel);
    }
  };

  // Before PIP-136, ordinary USDC settlements went to the DAO treasury.
  // After PIP-136, ordinary USDC settlements must be added to MIXED_DISTRIBUTIONS
  // once their source-backed product allocation is published. This avoids applying
  // a blanket 60% gross-up to an aggregate mixed-product payment.
  const ordinaryUsdcPredicate = options.dateString < PIP_136
    ? `mint = '${USDC_MINT}' AND to_address = '${PYTH_DAO_WALLET}'`
    : "1 = 0";

  // Direct PYTH distributions always settle at the DAO treasury.
  const subscriptionQuery = `
    SELECT
      mint as token_mint_address,
      TO_VARCHAR(COALESCE(SUM(TRY_TO_DECIMAL(raw_amount_str, 38, 0)), 0)) as total_amount
    FROM solana.assets.transfers
    WHERE block_timestamp >= TO_TIMESTAMP_NTZ(${options.startTimestamp}) AND block_timestamp < TO_TIMESTAMP_NTZ(${options.endTimestamp})
      AND mint IN ('${USDC_MINT}', '${PYTH_MINT}')
      AND from_address = '${DOURO_LABS_WALLET}'
      AND NOT (
        mint = '${USDC_MINT}'
        AND txn_id IN (${MIXED_DISTRIBUTION_TX_IDS})
      )
      AND (
        (${ordinaryUsdcPredicate})
        OR (mint = '${PYTH_MINT}' AND to_address = '${PYTH_DAO_WALLET}')
      )
    GROUP BY mint
  `;

  const subscriptionRes = await queryAllium(subscriptionQuery);

  for (const row of subscriptionRes) {
    const daoAmount = BigInt(row.total_amount || 0);
    if (daoAmount === 0n) continue;

    const isDirectPythDistribution = row.token_mint_address === PYTH_MINT;

    addDistribution(
      row.token_mint_address,
      daoAmount,
      DAO_SHARE_PERCENT,
      "Pyth Pro Subscription Fees",
      "Pyth Pro Subscription Fees to Pyth DAO",
      "Pyth Pro Subscription Fees to Douro Labs",
      !isDirectPythDistribution,
    );
  }

  // Process only source-backed mixed distributions in this fetch window.
  const mixedDistributionWindowOverlaps = MIXED_DISTRIBUTIONS.some(
    (distribution) =>
      options.startTimestamp < distribution.endTimestamp &&
      options.endTimestamp > distribution.startTimestamp,
  );

  if (mixedDistributionWindowOverlaps) {
    const mixedDistributionQuery = `
      SELECT
        txn_id,
        COUNT(*) as matching_transfers
      FROM solana.assets.transfers
      WHERE block_timestamp >= TO_TIMESTAMP_NTZ(${options.startTimestamp}) AND block_timestamp < TO_TIMESTAMP_NTZ(${options.endTimestamp})
        AND txn_id IN (${MIXED_DISTRIBUTION_TX_IDS})
        AND mint = '${USDC_MINT}'
        AND from_address = '${DOURO_LABS_WALLET}'
        AND to_address = '${PYTH_DAO_WALLET}'
      GROUP BY txn_id
    `;

    const mixedDistributionRes = await queryAllium(mixedDistributionQuery);

    for (const row of mixedDistributionRes) {
      if (BigInt(row.matching_transfers || 0) === 0n) continue;

      const distribution = MIXED_DISTRIBUTIONS.find(
        (item) => item.txnId === row.txn_id,
      );
      if (!distribution) continue;

      for (const allocation of distribution.allocations) {
        addDistribution(
          USDC_MINT,
          allocation.daoAmount,
          allocation.daoSharePercent,
          allocation.feesLabel,
          `${allocation.feesLabel} to Pyth DAO`,
          `${allocation.feesLabel} to Douro Labs`,
          true,
        );
      }
    }
  }

  // Count PYTH when it reaches the official DAO treasury.
  // Direct Douro distributions are known Pyth Pro umbrella revenue.
  // Historical Council returns are tracked separately as unattributed DAO treasury
  // buybacks until a direct Douro -> Council funding link is available.
  //
  // Example September 2026 direct buyback:
  // swap:   https://orbmarkets.io/tx/2YzFNSJDBQDHCAQVWz43nM7kk6ntKRRuMxf8mV4tehhKGzFmq1qBd6XreXmiYXWbDLuYS4KGbSNUYGaWFtTdxQqQ
  // return: https://orbmarkets.io/tx/26q1EGem6CSRrafDCkefLPY78WJJZs99ZweXaLVpkfvM9vLaa8o2vJTuzRPyqvxfVAe34bQTs6XmzVjwsvK4ZtKS
  const holdersRevenueQuery = `
    SELECT
      mint as token_mint_address,
      from_address as source_address,
      TO_VARCHAR(COALESCE(SUM(TRY_TO_DECIMAL(raw_amount_str, 38, 0)), 0)) as total_amount
    FROM solana.assets.transfers
    WHERE block_timestamp >= TO_TIMESTAMP_NTZ(${options.startTimestamp}) AND block_timestamp < TO_TIMESTAMP_NTZ(${options.endTimestamp})
      AND mint = '${PYTH_MINT}'
      AND to_address = '${PYTH_DAO_WALLET}'
      AND from_address IN ('${DOURO_LABS_WALLET}', '${PYTHIAN_COUNCIL_WALLET}')
    GROUP BY mint, from_address
  `;

  const holdersRevenueRes = await queryAllium(holdersRevenueQuery);

  for (const row of holdersRevenueRes) {
    const amount = BigInt(row.total_amount || 0);
    if (amount === 0n) continue;

    const label = row.source_address === DOURO_LABS_WALLET
      ? "PYTH Direct Distribution - Pyth Pro Umbrella"
      : "PYTH Buyback - Unattributed DAO Treasury";

    dailyHoldersRevenue.add(row.token_mint_address, amount, label);
  }

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue,
    dailyHoldersRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Fees: "Total Pyth Pro umbrella revenue, including Pyth Pro subscriptions, LaaS, and Indices. Product-specific DAO shares and supplier shares are applied before aggregation.",
  Revenue: "The DAO share of the Pyth Pro umbrella, including Pyth Pro subscriptions, LaaS, and Indices.",
  ProtocolRevenue: "Pyth Pro umbrella DAO revenue received in USDC and held as protocol or treasury revenue before a source-linked PYTH reclassification.",
  HoldersRevenue: "PYTH directly distributed by Douro Labs or returned to the DAO treasury after Council buybacks. Historical Council returns remain separately labelled as unattributed DAO treasury buybacks until their funding source is linked.",
  SupplySideRevenue: "Douro Labs' applicable share of Pyth Pro subscriptions, LaaS, and Indices revenue.",
}

const breakdownMethodology = {
  Fees: {
    "Pyth Pro Subscription Fees": "Gross Pyth Pro subscription revenue.",
    "Pyth Pro LaaS Fees": "Gross Listing as a Service revenue included in the Pyth Pro umbrella.",
    "Pyth Pro Indices Fees": "Gross Pyth Indices revenue included in the Pyth Pro umbrella.",
  },
  Revenue: {
    "Pyth Pro Subscription Fees to Pyth DAO": "Pyth Pro subscription share received by the DAO.",
    "Pyth Pro LaaS Fees to Pyth DAO": "LaaS share received by the DAO.",
    "Pyth Pro Indices Fees to Pyth DAO": "Indices share received by the DAO.",
  },
  ProtocolRevenue: {
    "Pyth Pro Subscription Fees to Pyth DAO": "Pyth Pro subscription DAO revenue held as protocol or treasury revenue.",
    "Pyth Pro LaaS Fees to Pyth DAO": "LaaS DAO revenue held as protocol or treasury revenue.",
    "Pyth Pro Indices Fees to Pyth DAO": "Indices DAO revenue held as protocol or treasury revenue.",
  },
  HoldersRevenue: {
    "PYTH Direct Distribution - Pyth Pro Umbrella": "PYTH directly distributed by Douro Labs to the DAO treasury.",
    "PYTH Buyback - Unattributed DAO Treasury": "PYTH returned to the DAO treasury by the Council from a buyback whose original funding source is not yet linked.",
  },
  SupplySideRevenue: {
    "Pyth Pro Subscription Fees to Douro Labs": "Douro Labs' share of Pyth Pro subscription revenue.",
    "Pyth Pro LaaS Fees to Douro Labs": "Douro Labs' share of LaaS revenue.",
    "Pyth Pro Indices Fees to Douro Labs": "Douro Labs' share of Indices revenue.",
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
