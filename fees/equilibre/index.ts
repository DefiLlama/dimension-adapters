import { Adapter, Fetch, FetchResultFees } from '../../adapters/types';
import { CHAIN } from '../../helpers/chains';
import { fetchV1 } from './equilibre';
import { fetchV2 } from './equilibre-v2';
import { fees_bribes } from './bribes';
import { getBlock } from '../../helpers/getBlock';


const getFees = async (timestamp: number): Promise<FetchResultFees> => {
  const fromTimestamp = timestamp - 60 * 60 * 24
  const toTimestamp = timestamp
  const fromBlock = (await getBlock(fromTimestamp, CHAIN.KAVA, {}));
  const toBlock = (await getBlock(toTimestamp, CHAIN.KAVA, {}));
  const  [feeV1, feeV2, bribes] = await Promise.all([fetchV1()(timestamp), fetchV2(fromBlock, toBlock,timestamp),  fees_bribes(fromBlock, toBlock, timestamp)]);
  const dailyFees = Number(feeV1.dailyFees) + Number(feeV2.dailyFees);
  const dailyRevenue = Number(feeV1.dailyRevenue) + Number(feeV2.dailyRevenue) + bribes;
  const dailyHoldersRevenue = Number(feeV1.dailyHoldersRevenue) + Number(feeV2.dailyHoldersRevenue) + bribes;
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
    [CHAIN.KAVA]: {
      fetch: getFees,
      start: async () => 5530444, // TODO: Add accurate timestamp
    },
  },
};
export default adapter;
