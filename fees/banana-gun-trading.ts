import ADDRESSES from '../helpers/coreAssets.json'
import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryDuneSql } from "../helpers/dune";

const contract_address: any = {
  [CHAIN.BLAST]: '0x461efe0100be0682545972ebfc8b4a13253bd602',
  [CHAIN.BASE]: '0x1fba6b0bbae2b74586fba407fb45bd4788b7b130',
  [CHAIN.ETHEREUM]: '0x3328f7f4a1d1c57c35df56bbf0c9dcafca309c49',
  [CHAIN.SONIC]: '0xdc13700db7f7cda382e10dba643574abded4fd5b',
  [CHAIN.BSC]: '0x461efe0100be0682545972ebfc8b4a13253bd602',
  [CHAIN.UNICHAIN]: '0x461efe0100be0682545972ebfc8b4a13253bd602'
}

const fethcFeesSolana = async (_: any, _1: any, options: FetchOptions) => {
  const dailyFees = options.createBalances();

  const query = `
    WITH
    allFeePayments AS (
      SELECT
        tx_id,
        balance_change / 1e9 AS fee_token_amount
      FROM
        solana.account_activity
      WHERE
        TIME_RANGE
        AND tx_success
        AND (
          address = '47hEzz83VFR23rLTEeVm9A7eFzjJwjvdupPPmX3cePqF' 
          OR address = '4BBNEVRgrxVKv9f7pMNE788XM1tt379X9vNjpDH2KCL7'
          OR address = '8r2hZoDfk5hDWJ1sDujAi2Qr45ZyZw5EQxAXiMZWLKh2'
        )
        AND balance_change > 0 
    )
    SELECT
      SUM(fee_token_amount) AS fee
    FROM
      dex_solana.trades AS trades
      JOIN allFeePayments AS feePayments ON trades.tx_id = feePayments.tx_id
    WHERE
      TIME_RANGE
      AND trades.trader_id NOT IN (
        '47hEzz83VFR23rLTEeVm9A7eFzjJwjvdupPPmX3cePqF',
        '4BBNEVRgrxVKv9f7pMNE788XM1tt379X9vNjpDH2KCL7',
        '8r2hZoDfk5hDWJ1sDujAi2Qr45ZyZw5EQxAXiMZWLKh2'
      )
  `;

  const fees = await queryDuneSql(options, query);
  dailyFees.add(ADDRESSES.solana.SOL, fees[0].fee * 1e9);

  return { dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyFees }
}

const fetch = async (_: any, _1: any, options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const logs = await options.getLogs({
    topic: '0x72015ace03712f361249380657b3d40777dd8f8a686664cab48afd9dbbe4499f',
    target: contract_address[options.chain],
  });
  logs.map((log: any) => {
    const data = log.data.replace('0x', '');
    const gasToken = data.slice(0, 64);
    dailyFees.addGasToken(Number('0x' + gasToken));
    dailyRevenue.addGasToken(Number('0x' + gasToken));
  });
  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
  }
}

const methodology = {
  Fees: 'All trading fees paid by users for using Banana Bot.',
  Revenue: 'Fees collected by Banana Bot protocol.',
  ProtocolRevenue: 'Fees collected by Banana Bot protocol.',
}

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  adapter: {
    [CHAIN.ETHEREUM]: { start: '2023-06-01', },
    [CHAIN.SOLANA]: {
      fetch: fethcFeesSolana,
      start: '2023-06-01',
    },
    [CHAIN.BLAST]: { start: '2023-06-01', },
    [CHAIN.BASE]: { start: '2023-06-01', },
    [CHAIN.SONIC]: { start: '2024-12-16', },
    [CHAIN.BSC]: { start: '2024-03-15', },
    [CHAIN.UNICHAIN]: { start: '2025-02-10', },
  },
  dependencies: [Dependencies.DUNE],
  methodology,
  isExpensiveAdapter: true,
};

export default adapter;
