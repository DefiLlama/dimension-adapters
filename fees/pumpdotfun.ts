import ADDRESSES from '../helpers/coreAssets.json'
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryDuneSql } from "../helpers/dune";

const fetch: any = async (_a: any, _b: any, options: FetchOptions) => {
  const dailyFees = options.createBalances();

  // https://dune.com/queries/4313339
  const value = (await queryDuneSql(options,
    `WITH new_tokens_solana as (
      SELECT 
        tx_id,
        from_owner
      FROM tokens_solana.transfers
      WHERE outer_executing_account = '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P'
      and block_time >= from_unixtime(${options.startTimestamp})
      AND block_time <= from_unixtime(${options.endTimestamp})
      GROUP BY 1,2
    ),

    fees as (
      SELECT 
        a.tx_id,
        a.block_time,
        a.address as tx_signer,
        'Sell' as action_type,
        balance_change/1e9 as total_sol
        FROM solana.account_activity a
        LEFT JOIN new_tokens_solana n 
            ON n.tx_id = a.tx_id 
        WHERE DATE(a.block_time) >= DATE('2024-01-14')
          AND a.block_time >= from_unixtime(${options.startTimestamp})
          AND a.block_time <= from_unixtime(${options.endTimestamp})
          AND (a.address = 'CebN5WGQ4jvEPvsVU4EoHEpgzq1VV7AbicfhtW4xC9iM'
            or a.address = 'FWsW1xNtWscwNmKv6wVsU1iTzRN6wmmk3MjxRP5tT7hz'
            or a.address = 'G5UZAVbAf46s7cKWoyKu8kYTip9DGTpbLZ2qa9Aq69dP'
            or a.address = '7hTckgnGnLQR6sdH7YkqFTAA7VwTfYFaZ6EhEsU3saCX'
            or a.address = '9rPYyANsfQZw3DnDmKE3YCQF5E8oD89UXoHn9JFEhJUz'
            or a.address = '7VtfL8fvgNfhz17qKRMjzQEXgbdpnHHHQRh54R9jP2RJ'
            or a.address = 'AVmoTthdrX6tKt4nDjco2D775W2YK3sDhxPcMmzUAmTY'
            or a.address = '62qc2CNXwrYqQScmEdiZFFAnJR262PxWEuNQtxfafNgV')
          and n.from_owner not in (
            '39azUYFWPz3VHgKCf3VChUwbpURdCHRxjWVowf5jUJjg',
            '12xs3VnsaoEduxobnbaxQtCh6PQMDoFUrP4YB1F8pFPX',
            '49AdQfhKyVgWKb1HPi6maQxm5tqJasePR9K6Mn67hEYA',
            'EkuimaBYybHvviYjtMXcnC7eg6WQmzLriDPtvh98fjRg',
            'CL9jPThhYnxvPSWNLhR4J7in13WvtMXXBGCe8LEhipmj'
          )
          and balance_change > 0
          and a.token_mint_address is null
      )
      SELECT
        SUM(total_sol) as total_sol_revenue
      FROM fees
      where block_time >= from_unixtime(${options.startTimestamp})
        and block_time <= from_unixtime(${options.endTimestamp})
    `
  ));
  dailyFees.add(ADDRESSES.solana.SOL, value[0].total_sol_revenue * 1e9);

  const query = `
    SELECT 
      SUM(amount_display) as total_amount
    FROM tokens_solana.transfers t
    WHERE 
      block_time >= from_unixtime(${options.startTimestamp})
      AND block_time <= from_unixtime(${options.endTimestamp})
      AND from_owner IN (
        '3vkpy5YHqnqJTnA5doWTpcgKyZiYsaXYzYM9wm8s3WTi',
        '88uq8JNL6ANwmow1og7VQD4hte73Jpw8qsUP77BtF6iE'
      )
      AND to_owner NOT IN (
        '6UJoY1CFEymoqMrnmBLeZoemBGiJcySNdR7Jyj2nF848',
        '88uq8JNL6ANwmow1og7VQD4hte73Jpw8qsUP77BtF6iE'
      )
      AND token_mint_address = 'So11111111111111111111111111111111111111112'
      AND amount_usd >= 100
  `
  const res = await queryDuneSql(options, query);
  const dailyHoldersRevenue = options.createBalances();
  dailyHoldersRevenue.add(ADDRESSES.solana.SOL, (res[0].total_amount || 0) * 1e9);

  return {
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
    dailyHoldersRevenue
  }
}

const adapter: SimpleAdapter = {
  version: 1,
  chains: [CHAIN.SOLANA],
  fetch,
  isExpensiveAdapter: true,
  start: '2024-01-14',
  methodology: {
    Fees: "Trading and launching tokens fees paid by users",
    Revenue: "Trading and launching tokens fees paid by users",
    ProtocolRevenue: "pump.fun takes all fees paid by users",
    HoldersRevenue: "PUMP token buybacks from the revenue"
  }
};

export default adapter;
