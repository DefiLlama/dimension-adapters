import { FetchOptions, SimpleAdapter } from '../adapters/types';
import { CHAIN } from '../helpers/chains';
import { queryDuneSql } from '../helpers/dune';
import { getSolanaReceived } from '../helpers/token';

const GEODNET_TOKEN_ADDRESS = '0xAC0F66379A6d7801D7726d5a943356A172549Adb';
const TOPIC_0_EVT_TRANSFER = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const PADDED_BURN_ADDRESS = '0x000000000000000000000000000000000000000000000000000000000000dead';
const INCINERATOR_ADDRESS = '1nc1nerator11111111111111111111111111111111';

interface ILog {
  data: string;
  transactionHash: string;
  topics: string[];
  address: string;
}

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const dailyHoldersRevenue = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();

  const burnedEventLogs: ILog[] = await options.getLogs({
    target: GEODNET_TOKEN_ADDRESS,
    topics: [TOPIC_0_EVT_TRANSFER, null, PADDED_BURN_ADDRESS] as any,
  })

  burnedEventLogs.forEach((log: ILog) => {
    dailyHoldersRevenue.add(GEODNET_TOKEN_ADDRESS, Number(log.data), 'GEOD token buyback and burn');
  })

  const burnBalancesScaled = dailyHoldersRevenue.clone(1 / 0.8);
  dailyFees.addBalances(burnBalancesScaled, { label: 'Station access fees derived from GEOD burns' });
  dailyRevenue.addBalances(burnBalancesScaled, { label: 'Protocol revenue from station access' });

  return {
    dailyFees,
    dailyRevenue,
    dailyHoldersRevenue,
  };
};

const fetchSolana = async (_a: any, _b: any, options: FetchOptions) => {
  // const query = `
  //   select
  //     account_mint as token_contract
  //     , SUM(amount) as total_amount
  //   from spl_token_solana.spl_token_call_burn
  //   where account_mint = '7JA5eZdCzztSfQbJvS8aVVxMFfd81Rs9VvwnocV1mKHu'
  //     and call_block_time >= from_unixtime(${options.startTimestamp})
  //     and call_block_time < from_unixtime(${options.endTimestamp})
  //   group by
  //       1
  // `;
  const dailyHoldersRevenue = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();

  const burnedBalances = await getSolanaReceived({ options, target: INCINERATOR_ADDRESS, mints: ['7JA5eZdCzztSfQbJvS8aVVxMFfd81Rs9VvwnocV1mKHu'] });
  dailyHoldersRevenue.addBalances(burnedBalances, { label: 'GEOD token buyback and burn' });

  const burnBalancesScaled = burnedBalances.clone(1 / 0.8);
  dailyFees.addBalances(burnBalancesScaled, { label: 'Station access fees derived from GEOD burns' });
  dailyRevenue.addBalances(burnBalancesScaled, { label: 'Protocol revenue from station access' });

  return {
    dailyFees,
    dailyRevenue,
    dailyHoldersRevenue,
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
  breakdownMethodology: {
    Fees: {
      'Station access fees derived from GEOD burns': 'Total station access fees inferred from GEOD burns (burns represent 80% of total fees, so total = burns / 0.8).',
    },
    Revenue: {
      'Protocol revenue from station access': 'Total revenue from station access fees, including both the 80% used for GEOD buyback-and-burn and the 20% retained by the foundation.',
    },
    HoldersRevenue: {
      'GEOD token buyback and burn': 'GEOD tokens bought back from the open market and sent to the burn address, representing 80% of station access fees redistributed to holders.',
    },
  },
};

export default adapter;
