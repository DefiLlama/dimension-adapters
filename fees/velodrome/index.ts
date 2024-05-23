import { Adapter, FetchResultFees } from '../../adapters/types';
import { OPTIMISM } from '../../helpers/chains';
import { fetchV1 } from './velodrome';


const getFees = async (timestamp: number): Promise<FetchResultFees> => {
  const  [feeV1] = await Promise.all([fetchV1()(timestamp)]);
  const dailyFees = Number(feeV1.dailyFees);
  const dailyRevenue = Number(feeV1.dailyRevenue);
  const dailyHoldersRevenue = Number(feeV1.dailyHoldersRevenue);
  return {
    dailyFees: `${dailyFees}`,
    dailyRevenue: `${dailyRevenue}`,
    dailyHoldersRevenue: `${dailyHoldersRevenue}`,
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
