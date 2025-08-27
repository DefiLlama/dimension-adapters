import ADDRESSES from '../helpers/coreAssets.json'
import { FetchOptions, SimpleAdapter } from '../adapters/types';
import { CHAIN } from '../helpers/chains';

const GEODNET_TOKEN_ADDRESS = '0xAC0F66379A6d7801D7726d5a943356A172549Adb';
const TOPIC_0_EVT_TRANSFER =
  '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const PADDED_BURN_ADDRESS =
  '0x000000000000000000000000000000000000000000000000000000000000dead';

interface ILog {
  data: string;
  transactionHash: string;
  topics: string[];
  address: string;
}

const fetchFees = async ({ getLogs, createBalances }: FetchOptions) => {
  const balances = createBalances();

  const burnedEventLogs: ILog[] = await getLogs({
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

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.POLYGON]: {
      fetch: fetchFees,
      start: '2023-09-10',
    },
  },
  methodology: {
    Fees: 'GEODNET receives fees for station access to their RTK network.',
    Revenue:
      "When GEODNET receives fees for station access, 80% of the fees are used to repurchase GEOD tokens from the open market and remove them from circulation. The remaining 20% supports the foundation's organizational costs.",
    HoldersRevenue:
      '80% of the fees are used to repurchase GEOD tokens from the open market and remove them from circulation.',
  },
};
export default adapter;
