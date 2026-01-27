import { FetchOptions, SimpleAdapter } from '../adapters/types';
import { CHAIN } from '../helpers/chains';
import { queryDuneSql } from '../helpers/dune';

const GEODNET_TOKEN_ADDRESS = '0xAC0F66379A6d7801D7726d5a943356A172549Adb';
const TOPIC_0_EVT_TRANSFER = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const PADDED_BURN_ADDRESS = '0x000000000000000000000000000000000000000000000000000000000000dead';

interface ILog {
  data: string;
  transactionHash: string;
  topics: string[];
  address: string;
}

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const balances = options.createBalances();

  const burnedEventLogs: ILog[] = await options.getLogs({
    target: GEODNET_TOKEN_ADDRESS,
    topics: [TOPIC_0_EVT_TRANSFER, null, PADDED_BURN_ADDRESS] as any,
  })

  burnedEventLogs.forEach((log: ILog) => {
    balances.add(GEODNET_TOKEN_ADDRESS, Number(log.data));
  })


  const dailyHoldersRevenue = balances
  const dailyFees = balances.clone(1 / 0.8)
  const dailyRevenue = dailyFees;

  return {
    dailyFees,
    dailyRevenue,
    dailyHoldersRevenue,
  };
};

const fetchSolana = async (_a: any, _b: any, options: FetchOptions) => {
  const query = `
    select
      account_mint as token_contract
      , SUM(amount) as total_amount
    from spl_token_solana.spl_token_call_burn
    where account_mint = '7JA5eZdCzztSfQbJvS8aVVxMFfd81Rs9VvwnocV1mKHu'
      and call_block_time >= from_unixtime(${options.startTimestamp})
      and call_block_time < from_unixtime(${options.endTimestamp})
    group by
        1
  `;
  const result = await queryDuneSql(options, query);

  const fees = options.createBalances();

  result.forEach((row: any) => {
    fees.add(row.token_contract, row.total_amount);
  });

  const dailyFees = fees.clone(1 / 0.8)

  return {
    dailyFees,
    dailyRevenue: dailyFees,
    dailyHoldersRevenue: fees,
  };
}

const adapter: SimpleAdapter = {
  version: 1,
  adapter: {
    [CHAIN.POLYGON]: {
      fetch,
      start: '2023-09-10',
    },
    [CHAIN.SOLANA]: {
      fetch: fetchSolana,
      start: '2024-09-24',
    }
  },
  methodology: {
    Fees: 'GEODNET receives fees for station access to their RTK network.',
    Revenue: "When GEODNET receives fees for station access, 80% of the fees are used to repurchase GEOD tokens from the open market and remove them from circulation. The remaining 20% supports the foundation's organizational costs.",
    HoldersRevenue: '80% of the fees are used to repurchase GEOD tokens from the open market and remove them from circulation.',
  },
};

export default adapter;
