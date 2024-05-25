import { Adapter, FetchResultFees } from '../../adapters/types';
import { ZKSYNC } from '../../helpers/chains';
import { fetchV1, fetchV2 } from './koi-finance';


const getFees = async (timestamp: number): Promise<FetchResultFees> => {
  const  [feeV1, feeV2] = await Promise.all([fetchV1()(timestamp), fetchV2()(timestamp)]);
  const dailyFees = Number(feeV1.dailyFees) +  Number(feeV2.dailyFees);
  const dailyRevenue = Number(feeV1.dailyRevenue) + Number(feeV2.dailyRevenue);

  return {
    dailyFees: `${dailyFees}`,
    dailyRevenue: `${dailyRevenue}`,
    timestamp
  }
}

const adapter: Adapter = {
  adapter: {
    [ZKSYNC]: {
      fetch: getFees,
      start: 1677110400, // TODO: Add accurate timestamp
    },
  },
};

export default adapter;