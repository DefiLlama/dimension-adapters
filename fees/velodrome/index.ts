import { Adapter, FetchOptions, FetchResultFees } from '../../adapters/types';
import { OPTIMISM } from '../../helpers/chains';
import { fetchV1 } from './velodrome';


const getFees = async (options: FetchOptions) => {
  const  [feeV1] = await Promise.all([fetchV1()(options)]);
  const dailyFees = Number(feeV1.dailyFees);
  const dailyRevenue = Number(feeV1.dailyRevenue);
  const dailyHoldersRevenue = Number(feeV1.dailyHoldersRevenue);
  return {
    dailyFees: `${dailyFees}`,
    dailyRevenue: `${dailyRevenue}`,
    dailyHoldersRevenue: `${dailyHoldersRevenue}`,
  }
}

const adapter: Adapter = {
  version: 2,
  adapter: {
    [OPTIMISM]: {
      fetch: getFees,
      start: 1677110400, // TODO: Add accurate timestamp
    },
  },
};
export default adapter;
