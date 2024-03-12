import * as sdk from '@defillama/sdk';
import { FetchResultFees, SimpleAdapter } from '../adapters/types';
import { CHAIN } from '../helpers/chains';
import { getBlock } from '../helpers/getBlock';
import { getPrices } from '../utils/prices';

const GEODNET_TOKEN_ADDRESS = '0xAC0F66379A6d7801D7726d5a943356A172549Adb';
const GEODNET_NUM_DECIMALS = 18;
const GEODNET_COIN_ID = 'coingecko:geodnet';
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

const fetchFees = async (timestamp: number): Promise<FetchResultFees> => {
  const fromTimestamp = timestamp - 60 * 60 * 24;
  const toTimestamp = timestamp;
  const fromBlock = await getBlock(fromTimestamp, CHAIN.POLYGON, {});
  const toBlock = await getBlock(toTimestamp, CHAIN.POLYGON, {});

  const batchSize = 4500;
  const batches = Math.ceil((toBlock - fromBlock) / batchSize);

  const erc20transferLog: ILog[] = await Promise.all(
    Array.from({ length: batches }, (_, index) =>
      sdk.getEventLogs({
        target: GEODNET_TOKEN_ADDRESS,
        topic: TOPIC_0_EVT_TRANSFER,
        toBlock: fromBlock + (index + 1) * batchSize,
        fromBlock: fromBlock + index * batchSize,
        chain: CHAIN.POLYGON,
      })
    )
  ).then((responses) => responses.flatMap((response) => response as ILog[]));

  const burnedEventLogs = erc20transferLog.filter(
    (log) => log.topics[2].toLowerCase() === PADDED_BURN_ADDRESS.toLowerCase()
  );
  const totalBurnsInNativeToken = burnedEventLogs.reduce(
    (acc: number, log: ILog) => {
      const amount = Number(log.data) / 10 ** GEODNET_NUM_DECIMALS;
      return acc + amount;
    },
    0
  );

  const prices = await getPrices([GEODNET_COIN_ID], timestamp);

  const dailyHoldersRevenue =
    prices[GEODNET_COIN_ID].price * totalBurnsInNativeToken;
  const dailyFees = dailyHoldersRevenue / 0.8;
  const dailyRevenue = dailyFees;

  return {
    dailyFees: `${dailyFees}`,
    dailyRevenue: `${dailyRevenue}`,
    dailyHoldersRevenue: `${dailyHoldersRevenue}`,
    timestamp,
  };
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.POLYGON]: {
      fetch: fetchFees,
      start: 1694304000,
      meta: {
        methodology: {
          Fees: 'GEODNET receives fees for station access to their RTK network.',
          Revenue:
            "When GEODNET receives fees for station access, 80% of the fees are used to repurchase GEOD tokens from the open market and remove them from circulation. The remaining 20% supports the foundation's organizational costs.",
          HoldersRevenue:
            '80% of the fees are used to repurchase GEOD tokens from the open market and remove them from circulation.',
        },
      },
    },
  },
};
export default adapter;
