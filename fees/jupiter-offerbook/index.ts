import { Dependencies, FetchOptions, FetchResultV2, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";
import { getJupiterStatsRevenue } from "../../helpers/jupiter-stats";

// Jupiter's stats API covers Offerbook from 2026-06-03.
const STATS_API_START_TS = 1780444800 // 2026-06-03

const labels: Record<string, string> = {
  origination: "Offerbook Loan Origination Fees",
  repayment: "Offerbook Loan Repayment Fees",
  collateral_claim: "Offerbook Collateral Claim Fees"
}

const fetchOnchain = async (options: FetchOptions): Promise<FetchResultV2> => {
  const start = `from_unixtime(${options.startTimestamp})`;
  const end = `from_unixtime(${options.endTimestamp})`;

  const sql = `
    WITH protocol_fee AS (
      SELECT evt_tx_id, mint, CAST(amount AS double) AS amount, CAST(net_amount AS double) AS net_amount
      FROM jupiter_solana.offerbook_evt_protocolfee
      WHERE evt_block_time >= ${start} AND evt_block_time < ${end}
    ),
    -- Each ProtocolFee shares a transaction with exactly one loan-lifecycle event,
    -- which is what tells us the fee stage it was charged at.
    created_tx   AS (SELECT DISTINCT evt_tx_id FROM jupiter_solana.offerbook_evt_loancreated   WHERE evt_block_time >= ${start} AND evt_block_time < ${end}),
    repaid_tx    AS (SELECT DISTINCT evt_tx_id FROM jupiter_solana.offerbook_evt_loanrepaid    WHERE evt_block_time >= ${start} AND evt_block_time < ${end}),
    defaulted_tx AS (SELECT DISTINCT evt_tx_id FROM jupiter_solana.offerbook_evt_loandefaulted WHERE evt_block_time >= ${start} AND evt_block_time < ${end})

    -- Protocol fees, split by the stage they were charged at.
    SELECT
        CASE WHEN c.evt_tx_id IS NOT NULL THEN 'origination'
             WHEN r.evt_tx_id IS NOT NULL THEN 'repayment'
             WHEN d.evt_tx_id IS NOT NULL THEN 'collateral_claim' END AS kind
      , pf.mint
      , SUM(pf.net_amount) AS net
    FROM protocol_fee pf
    LEFT JOIN created_tx   c ON pf.evt_tx_id = c.evt_tx_id
    LEFT JOIN repaid_tx    r ON pf.evt_tx_id = r.evt_tx_id
    LEFT JOIN defaulted_tx d ON pf.evt_tx_id = d.evt_tx_id
    GROUP BY 1, 2

    UNION ALL

    SELECT
        'interest' AS kind
      , regexp_extract(json_extract_scalar(loan, '$.LoanEventV0.principal.EventAsset.Token.0.EventTokenAsset.mint'), 'PublicKey\\(([^)]+)\\)', 1) AS mint
      , SUM(CAST(json_extract_scalar(loan, '$.LoanEventV0.interest') AS double)) AS net
    FROM jupiter_solana.offerbook_evt_loanrepaid
    WHERE evt_block_time >= ${start} AND evt_block_time < ${end}
      AND loan IS NOT NULL
    GROUP BY 2
  `;

  const rows: any[] = await queryDuneSql(options, sql);

  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();


  for (const row of rows) {
    if (!row.mint) continue;
    if (row.kind === 'interest') {
      dailyFees.add(row.mint, row.net, "Offerbook Borrow Interest");
      dailySupplySideRevenue.add(row.mint, row.net, "Offerbook Borrow Interest To Lenders");
    } else if (row.kind === 'repayment') {
      dailyRevenue.add(row.mint, row.net, labels[row.kind]);
      dailySupplySideRevenue.subtractToken(row.mint, row.net, "Offerbook Borrow Interest To Lenders");
    } else {
      dailyFees.add(row.mint, row.net, labels[row.kind]);
      dailyRevenue.add(row.mint, row.net, labels[row.kind]);
    }
  }
  return { dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue, dailySupplySideRevenue };
};

// Program offerbkFMvVfpQhL8ZQ5iromnjct5rz3r52B9ewu3ie; fee wallet Edt83Aw3RAELsorwJkt4DDkczrTpHsNeFGzty83TQzuy.
// The stats API counts interest as it accrues, not at repayment.
const fetchStatsApi = async (options: FetchOptions) => {
  const { dailyFees, dailyRevenue, dailySupplySideRevenue } = await getJupiterStatsRevenue(options, {
    offerbook: {
      fees: "Offerbook Interest And Fees",
      revenue: "Offerbook Interest And Fees To Jupiter",
      supplySide: "Offerbook Interest And Fees To Lenders And Referrers",
    },
  });
  return { dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue.clone(1), dailySupplySideRevenue };
};

const fetch = async (options: FetchOptions) =>
  options.startOfDay >= STATS_API_START_TS ? fetchStatsApi(options) : fetchOnchain(options);

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.SOLANA],
  start: '2026-04-24',
  dependencies: [Dependencies.DUNE],
  isExpensiveAdapter: true,
  allowNegativeValue: true, // a loss on a loan funded by Jupiter is booked on the day it is realized
  methodology: {
    Fees: 'Borrow interest paid by borrowers on repaid loans, plus loan origination fees and collateral claim fees. From 2026-06-03, from Jupiter\'s stats API, with interest counted as it accrues, including on loans funded by Jupiter.',
    Revenue: "The protocol's share: the repayment fee (10% of interest) it takes from borrow interest, plus all loan origination fees (25% of interest) and collateral claim fees (0.1% of collateral, excluding NFT/RWA). From 2026-06-03, from Jupiter's stats API: protocol fees and interest on loans funded by Jupiter, less losses on those loans.",
    ProtocolRevenue: "The protocol's share: the repayment fee (10% of interest) it takes from borrow interest, plus all loan origination fees (25% of interest) and collateral claim fees (0.1% of collateral, excluding NFT/RWA). From 2026-06-03, from Jupiter's stats API: protocol fees and interest on loans funded by Jupiter, less losses on those loans.",
    SupplySideRevenue: "90% of borrow interest is paid to lenders. From 2026-06-03, interest paid to other lenders and fee rebates to referrers.",
  },
  breakdownMethodology: {
    Fees: {
      'Offerbook Borrow Interest': 'Total interest paid by borrowers over the full term of repaid loans.',
      'Offerbook Interest And Fees': 'From 2026-06-03, borrow interest as it accrues, and origination, repayment and collateral claim fees.',
      [labels.origination]: '25% of estimated interest, charged to the borrower when the loan is created.',
      [labels.collateral_claim]: '0.1% of collateral value, charged when a lender claims collateral after loan maturity (excludes NFT/RWA collateral).',
    },
    Revenue: {
      'Offerbook Interest And Fees To Jupiter': 'From 2026-06-03, protocol fees and interest on loans funded by Jupiter, less losses on those loans.',
      [labels.origination]: '25% of estimated interest, charged to the borrower when the loan is created.',
      [labels.repayment]: "10% of interest, deducted from the lender's return when the loan is repaid.",
      [labels.collateral_claim]: '0.1% of collateral value, charged when a lender claims collateral after loan maturity (excludes NFT/RWA collateral).',
    },
    ProtocolRevenue: {
      'Offerbook Interest And Fees To Jupiter': 'From 2026-06-03, protocol fees and interest on loans funded by Jupiter, less losses on those loans.',
      [labels.origination]: '25% of estimated interest, charged to the borrower when the loan is created.',
      [labels.repayment]: "10% of interest, deducted from the lender's return when the loan is repaid.",
      [labels.collateral_claim]: '0.1% of collateral value, charged when a lender claims collateral after loan maturity (excludes NFT/RWA collateral).',
    },
    SupplySideRevenue: {
      'Offerbook Borrow Interest To Lenders': '90% of borrow interest is paid to lenders',
      'Offerbook Interest And Fees To Lenders And Referrers': 'From 2026-06-03, interest paid to other lenders and fee rebates to referrers.'
    }
  },
};

export default adapter;
