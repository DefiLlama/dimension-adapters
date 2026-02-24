import { Dependencies, FetchOptions, SimpleAdapter } from '../adapters/types';
import { CHAIN } from '../helpers/chains';
import { queryDuneSql } from '../helpers/dune';
import ADDRESSES from '../helpers/coreAssets.json';
import { METRIC } from '../helpers/metrics';

// https://dune.com/adam_tehc/axiom
const fetch: any = async (_a: any, _b: any, options: FetchOptions) => {
  const query = `WITH
    allFeePayments AS (
        SELECT
          tx_id,
          balance_change AS fee_token_amount
        FROM
          solana.account_activity
        WHERE
          TIME_RANGE
          AND tx_success
          AND address IN (
            '7LCZckF6XXGQ1hDY6HFXBKWAtiUgL9QY5vj1C4Bn1Qjj',
            '4V65jvcDG9DSQioUVqVPiUcUY9v6sb6HKtMnsxSKEz5S',
            'CeA3sPZfWWToFEBmw5n1Y93tnV66Vmp8LacLzsVprgxZ',
            'AaG6of1gbj1pbDumvbSiTuJhRCRkkUNaWVxijSbWvTJW',
            '7oi1L8U9MRu5zDz5syFahsiLUric47LzvJBQX6r827ws',
            '9kPrgLggBJ69tx1czYAbp7fezuUmL337BsqQTKETUEhP',
            'DKyUs1xXMDy8Z11zNsLnUg3dy9HZf6hYZidB6WodcaGy',
            '4FobGn5ZWYquoJkxMzh2VUAWvV36xMgxQ3M7uG1pGGhd',
            '76sxKrPtgoJHDJvxwFHqb3cAXWfRHFLe3VpKcLCAHSEf',
            'H2cDR3EkJjtTKDQKk8SJS48du9mhsdzQhy8xJx5UMqQK',
            '8m5GkL7nVy95G4YVUbs79z873oVKqg2afgKRmqxsiiRm',
            '4kuG6NsAFJNwqEkac8GFDMMheCGKUPEbaRVHHyFHSwWz',
            '8vFGAKdwpn4hk7kc1cBgfWZzpyW3MEMDATDzVZhddeQb',
            '86Vh4XGLW2b6nvWbRyDs4ScgMXbuvRCHT7WbUT3RFxKG',
            'DZfEurFKFtSbdWZsKSDTqpqsQgvXxmESpvRtXkAdgLwM',
            '5L2QKqDn5ukJSWGyqR4RPvFvwnBabKWqAqMzH4heaQNB',
            'DYVeNgXGLAhZdeLMMYnCw1nPnMxkBN7fJnNpHmizTrrF',
            'Hbj6XdxX6eV4nfbYTseysibp4zZJtVRRPn2J3BhGRuK9',
            '846ah7iBSu9ApuCyEhA5xpnjHHX7d4QJKetWLbwzmJZ8',
            '5BqYhuD4q1YD3DMAYkc1FeTu9vqQVYYdfBAmkZjamyZg'
          )
          AND balance_change > 0
    ),
    botTrades AS (
      SELECT
        trades.tx_id,
        MAX(fee_token_amount) AS fee
      FROM
        dex_solana.trades AS trades
        JOIN allFeePayments AS feePayments ON trades.tx_id = feePayments.tx_id
      WHERE
        TIME_RANGE
        AND trades.trader_id NOT IN (
            '7LCZckF6XXGQ1hDY6HFXBKWAtiUgL9QY5vj1C4Bn1Qjj',
            '4V65jvcDG9DSQioUVqVPiUcUY9v6sb6HKtMnsxSKEz5S',
            'CeA3sPZfWWToFEBmw5n1Y93tnV66Vmp8LacLzsVprgxZ',
            'AaG6of1gbj1pbDumvbSiTuJhRCRkkUNaWVxijSbWvTJW',
            '7oi1L8U9MRu5zDz5syFahsiLUric47LzvJBQX6r827ws',
            '9kPrgLggBJ69tx1czYAbp7fezuUmL337BsqQTKETUEhP',
            'DKyUs1xXMDy8Z11zNsLnUg3dy9HZf6hYZidB6WodcaGy',
            '4FobGn5ZWYquoJkxMzh2VUAWvV36xMgxQ3M7uG1pGGhd',
            '76sxKrPtgoJHDJvxwFHqb3cAXWfRHFLe3VpKcLCAHSEf',
            'H2cDR3EkJjtTKDQKk8SJS48du9mhsdzQhy8xJx5UMqQK',
            '8m5GkL7nVy95G4YVUbs79z873oVKqg2afgKRmqxsiiRm',
            '4kuG6NsAFJNwqEkac8GFDMMheCGKUPEbaRVHHyFHSwWz',
            '8vFGAKdwpn4hk7kc1cBgfWZzpyW3MEMDATDzVZhddeQb',
            '86Vh4XGLW2b6nvWbRyDs4ScgMXbuvRCHT7WbUT3RFxKG',
            'DZfEurFKFtSbdWZsKSDTqpqsQgvXxmESpvRtXkAdgLwM',
            '5L2QKqDn5ukJSWGyqR4RPvFvwnBabKWqAqMzH4heaQNB',
            'DYVeNgXGLAhZdeLMMYnCw1nPnMxkBN7fJnNpHmizTrrF',
            'Hbj6XdxX6eV4nfbYTseysibp4zZJtVRRPn2J3BhGRuK9',
            '846ah7iBSu9ApuCyEhA5xpnjHHX7d4QJKetWLbwzmJZ8',
            '5BqYhuD4q1YD3DMAYkc1FeTu9vqQVYYdfBAmkZjamyZg'
          )
      GROUP BY trades.tx_id
    )
    SELECT
      SUM(fee) AS fee
    FROM
      botTrades
  `;
  const fees = await queryDuneSql(options, query);
  const dailyFees = options.createBalances();
  dailyFees.add(ADDRESSES.solana.SOL, fees[0].fee, METRIC.TRADING_FEES);

  return { dailyFees, dailyUserFees: dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyFees, dailyHoldersRevenue: 0 }
};


const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.SOLANA],
  dependencies: [Dependencies.DUNE],
  start: '2025-01-21',
  methodology: {
    Fees: 'User pays 0.75%-1% fee on each trade',
    Revenue: 'Users receive some chunk of the fees, so revenue is lower than fees',
    UserFees: 'User pays 0.75%-1% fee on each trade',
    HoldersRevenue: 'No token holder revenue',
    ProtocolRevenue: 'Users receive some chunk of the fees, so revenue is lower than fees',
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.TRADING_FEES]: 'Fee paid by users on each trade routed through Axiom (0.75%-1%)',
    },
  },
  isExpensiveAdapter: true,
};

export default adapter;
