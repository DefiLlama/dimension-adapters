import { Adapter } from '../../adapters/types';
import { CHAIN, OPTIMISM } from '../../helpers/chains';
import { fetchV1 } from './velodrome';
import { fetchV2 } from './velodrome-v2';
import { fees_bribes } from './bribes';
import { getBlock } from '../../helpers/getBlock';


const getFees = async (timestamp: number) => {
  const fromTimestamp = timestamp - 60 * 60 * 24
  const toTimestamp = timestamp
  const fromBlock = (await getBlock(fromTimestamp, CHAIN.OPTIMISM, {}));
  const toBlock = (await getBlock(toTimestamp, CHAIN.OPTIMISM, {}));
  // const  [feeV1, feeV2] = await Promise.all([fetchV1()(timestamp), fetchV2(timestamp)]);
  // const dailyFees = Number(feeV1.dailyFees) + Number(feeV2.dailyFees);
  // const dailyRevenue = Number(feeV1.dailyRevenue) + Number(feeV2.dailyRevenue);
  // const dailyHoldersRevenue = Number(feeV1.dailyHoldersRevenue) + Number(feeV2.dailyHoldersRevenue);
  const fe  = await fees_bribes(fromBlock, toBlock);
  return {
    // dailyFees: `${dailyFees}`,
    // dailyRevenue: `${dailyRevenue}`,
    // dailyHoldersRevenue: `${dailyHoldersRevenue}`,
    timestamp
  }
}

const adapter: Adapter = {
  adapter: {
    [OPTIMISM]: {
      fetch: getFees,
      start: async () => 1677110400, // TODO: Add accurate timestamp
    },
  },
};
export default adapter;
