import { Adapter, FetchOptions, FetchResultV2 } from '../../adapters/types';
import { CHAIN } from '../../helpers/chains';
import { getBribes } from './bribes';
import { exportDexVolumeAndFees } from '../../helpers/dexVolumeLogs';

const FACTORY_ADDRESS = '0xbc83f7dF70aE8A3e4192e1916d9D0F5C2ee86367';
const getFees = async (options: FetchOptions): Promise<FetchResultV2> => {
  const v1Results = await exportDexVolumeAndFees({ chain: CHAIN.SCROLL, factory: FACTORY_ADDRESS })(options.endTimestamp, {}, options)
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
    [CHAIN.SCROLL]: {
      fetch: getFees,
      start: 1710806400
    },
  },
};
export default adapter;
