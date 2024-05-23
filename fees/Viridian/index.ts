import { Adapter, FetchOptions, FetchResultV2 } from '../../adapters/types';
import { CHAIN } from '../../helpers/chains';
import { getBribes } from './bribes';
import { exportDexVolumeAndFees } from '../../helpers/dexVolumeLogs';

const FACTORY_ADDRESS = '0xb54a83cfEc6052E05BB2925097FAff0EC22893F3';

const getFees = async (options: FetchOptions): Promise<FetchResultV2> => {
  const v1Results = await exportDexVolumeAndFees({ chain: CHAIN.CORE, factory: FACTORY_ADDRESS })(options.endTimestamp, {}, options)
  const bribesResult = await getBribes(options);
  v1Results.dailyBribesRevenue = bribesResult.dailyBribesRevenue;
  return {
    dailyFees: v1Results.dailyFees,
    dailyRevenue: v1Results.dailyRevenue,
    dailyHoldersRevenue: v1Results.dailyFees,
    dailyBribesRevenue: v1Results.dailyBribesRevenue,
  }
}

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.CORE]: {
      fetch: getFees,
      start: 1711868972
    },
  },
};
export default adapter;