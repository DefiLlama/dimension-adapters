import { Balances } from '@defillama/sdk';
import { Dependencies, FetchOptions, SimpleAdapter } from '../../adapters/types';
import { CHAIN } from '../../helpers/chains';
import { queryDuneSql } from '../../helpers/dune';

const SOLANA_CG_ID = 'solana';

const FEE_ACCOUNTS = {
  treasury: '4Ucw8BNkLWBu6gxkQsw3BRG2qRtw5WrG1UxiKpQjScH5',
  stockpileSolVault: '8RxMJD7BtdzxuZkmDqcxhR6gWvegLJ1GNf9NFrPkCmwf',
  buybackSolVault: '8nEo7GArDc3aVDuHoiDYJoVUNLtzgYaVmGGNvxELCZJc',
};

type ZincFeeBucket = 'treasury' | 'stockpile_sol_vault' | 'buyback_sol_vault';

type ZincFeeRow = {
  bucket: ZincFeeBucket;
  total_sol_inbound: number | string | null;
};

async function countZincSolFeeInflows(options: FetchOptions): Promise<Record<ZincFeeBucket, number>> {
  const duneQueryString = `
    SELECT
      CASE
        WHEN address = '${FEE_ACCOUNTS.treasury}' THEN 'treasury'
        WHEN address = '${FEE_ACCOUNTS.stockpileSolVault}' THEN 'stockpile_sol_vault'
        WHEN address = '${FEE_ACCOUNTS.buybackSolVault}' THEN 'buyback_sol_vault'
      END AS bucket,
      SUM(
        CASE
          WHEN post_balance > pre_balance THEN (post_balance - pre_balance) / 1e9
          ELSE 0
        END
      ) AS total_sol_inbound
    FROM solana.account_activity
    WHERE
      address IN (
        '${FEE_ACCOUNTS.treasury}',
        '${FEE_ACCOUNTS.stockpileSolVault}',
        '${FEE_ACCOUNTS.buybackSolVault}'
      )
      AND block_time >= from_unixtime(${options.startTimestamp})
      AND block_time < from_unixtime(${options.endTimestamp})
      AND tx_success = true
    GROUP BY 1
  `;

  const rows = await queryDuneSql(options, duneQueryString) as ZincFeeRow[];
  const totals: Record<ZincFeeBucket, number> = {
    treasury: 0,
    stockpile_sol_vault: 0,
    buyback_sol_vault: 0,
  };

  rows.forEach((row) => {
    if (row.bucket) {
      totals[row.bucket] = Number(row.total_sol_inbound ?? 0);
    }
  });

  return totals;
}

function addSol(balance: Balances, amount: number, label: string) {
  if (amount > 0) balance.addCGToken(SOLANA_CG_ID, amount, label);
}

const fetch = async (_timestamp: number, _chainBlocks: any, options: FetchOptions) => {
  const totals = await countZincSolFeeInflows(options);

  const dailyProtocolRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  addSol(dailyProtocolRevenue, totals.treasury, 'Treasury Fees');
  addSol(dailyHoldersRevenue, totals.buyback_sol_vault, 'Buyback Fees');
  addSol(dailySupplySideRevenue, totals.stockpile_sol_vault, 'Stockpile Fees');

  const dailyFees = options.createBalances();
  dailyFees.addBalances(dailyProtocolRevenue);
  dailyFees.addBalances(dailyHoldersRevenue);
  dailyFees.addBalances(dailySupplySideRevenue);

  const dailyRevenue = options.createBalances();
  dailyRevenue.addBalances(dailyProtocolRevenue);
  dailyRevenue.addBalances(dailyHoldersRevenue);

  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailyProtocolRevenue,
    dailyHoldersRevenue,
    dailySupplySideRevenue,
  };
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.SOLANA],
  start: '2026-05-30',
  dependencies: [Dependencies.DUNE],
  methodology: {
    Fees: 'Counts SOL fee inflows to Zinc protocol custody accounts: the protocol treasury, buyback SOL vault, and stockpile SOL vault. Affiliate/referral payouts are excluded because they settle to dynamic player profile accounts.',
    UserFees: 'Same as Fees.',
    Revenue: 'Protocol treasury fees plus SOL routed to the buyback vault.',
    ProtocolRevenue: 'SOL fees received by the Zinc treasury PDA.',
    HoldersRevenue: 'SOL fees received by the buyback SOL vault for ZINC buybacks.',
    SupplySideRevenue: 'SOL fees received by the stockpile SOL vault for player rewards.',
  },
};

export default adapter;
