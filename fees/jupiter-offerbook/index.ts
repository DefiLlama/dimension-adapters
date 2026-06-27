import { Dependencies, FetchOptions, FetchResultV2, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";

const labels = {
  origination: "Loan Origination Fees",
  repayment: "Loan Repayment Fees",
  collateral_claim: "Collateral Claim Fees"
}

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
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

  for (const row of rows) {
    if (!row.mint) continue;
    if (row.kind === 'interest') {
      dailyFees.add(row.mint, row.net, "Borrow Interest");
    } else if (row.kind === 'repayment') {
      dailyRevenue.add(row.mint, row.net, labels[row.kind]);
    } else {
      dailyFees.add(row.mint, row.net, labels[row.kind]);
      dailyRevenue.add(row.mint, row.net, labels[row.kind]);
    }
  }
  return { dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue };
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.SOLANA],
  start: '2026-04-24',
  dependencies: [Dependencies.DUNE],
  isExpensiveAdapter: true,
  methodology: {
    Fees: 'Borrow interest paid by borrowers on repaid loans, plus loan origination fees and collateral claim fees.',
    Revenue: "The protocol's share: the repayment fee (10% of interest) it takes from borrow interest, plus all loan origination fees (25% of interest) and collateral claim fees (0.1% of collateral, excluding NFT/RWA).",
    ProtocolRevenue: "The protocol's share: the repayment fee (10% of interest) it takes from borrow interest, plus all loan origination fees (25% of interest) and collateral claim fees (0.1% of collateral, excluding NFT/RWA).",
  },
  breakdownMethodology: {
    Fees: {
      'Borrow Interest': 'Total interest paid by borrowers over the full term of repaid loans.',
      [labels.origination]: '25% of estimated interest, charged to the borrower when the loan is created.',
      [labels.collateral_claim]: '0.1% of collateral value, charged when a lender claims collateral after loan maturity (excludes NFT/RWA collateral).',
    },
    Revenue: {
      [labels.origination]: '25% of estimated interest, charged to the borrower when the loan is created.',
      [labels.repayment]: "10% of interest, deducted from the lender's return when the loan is repaid.",
      [labels.collateral_claim]: '0.1% of collateral value, charged when a lender claims collateral after loan maturity (excludes NFT/RWA collateral).',
    },
    ProtocolRevenue: {
      [labels.origination]: '25% of estimated interest, charged to the borrower when the loan is created.',
      [labels.repayment]: "10% of interest, deducted from the lender's return when the loan is repaid.",
      [labels.collateral_claim]: '0.1% of collateral value, charged when a lender claims collateral after loan maturity (excludes NFT/RWA collateral).',
    },
  },
};

export default adapter;
