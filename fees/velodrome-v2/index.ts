import { Adapter, Fetch, FetchOptions, FetchResultFees } from '../../adapters/types';
import { CHAIN, OPTIMISM } from '../../helpers/chains';
import { fetchV2 } from './velodrome-v2';
import { fees_bribes } from './bribes';
import { getBlock } from '../../helpers/getBlock';


const getFees = async (timestamp: number, _, fetchOptions: FetchOptions): Promise<FetchResultFees> => {
  const fromTimestamp = timestamp - 60 * 60 * 24
  const toTimestamp = timestamp
  const fromBlock = (await getBlock(fromTimestamp, CHAIN.OPTIMISM, {}));
  const toBlock = (await getBlock(toTimestamp, CHAIN.OPTIMISM, {}));
  const  [feeV2, bribes] = await Promise.all([fetchV2(fromBlock, toBlock,timestamp, fetchOptions),  fees_bribes(fromBlock, toBlock, timestamp)]);
  const dailyFees =  Number(feeV2.dailyFees);
  const dailyRevenue =  Number(feeV2.dailyRevenue);
  const dailyHoldersRevenue =  Number(feeV2.dailyHoldersRevenue);
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
    [OPTIMISM]: {
      fetch: getFees,
      start: 1677110400, // TODO: Add accurate timestamp
    },
  },
};
export default adapter;
