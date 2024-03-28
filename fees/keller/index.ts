import { Adapter, FetchResultFees } from '../../adapters/types';
import { CHAIN } from '../../helpers/chains';
import { fetchV2 } from './keller-v2';
import { fees_bribes } from './bribes';
import { getBlock } from '../../helpers/getBlock';
import { getTimestamp } from '@defillama/sdk/build/util';


const getFees = async (timestamp: number): Promise<FetchResultFees> => {
  const fromTimestamp = timestamp - 60 * 60 * 24
  const toTimestamp = timestamp
  const fromBlock = (await getBlock(fromTimestamp, CHAIN.SCROLL, {}));
  const toBlock = (await getBlock(toTimestamp, CHAIN.SCROLL, {}));

  const  [feeV2, bribes] = await Promise.all([fetchV2(fromBlock, toBlock, timestamp),  fees_bribes(fromBlock, toBlock, timestamp)]);
  const dailyFees = Number(feeV2.dailyFees);
  const dailyRevenue = Number(feeV2.dailyRevenue) + bribes;
  const dailyHoldersRevenue = Number(feeV2.dailyHoldersRevenue) + bribes;
  return {
    dailyFees: `${dailyFees}`,
    dailyRevenue: `${dailyRevenue}`,
    dailyHoldersRevenue: `${dailyHoldersRevenue}`,
    dailyBribesRevenue: `${bribes}`,
    timestamp
  }
}

const adapter: Adapter = {
  adapter: {
    [CHAIN.SCROLL]: {
      fetch: getFees,
      start: async () => getTimestamp(4265908, "scroll"), // TODO: Add accurate timestamp
    },
  },
};
export default adapter;
