import { Adapter, FetchOptions, FetchResultFees } from '../../adapters/types';
import { OPTIMISM } from '../../helpers/chains';
import { fetchV2 } from './velodrome-v2';
import { fees_bribes } from './bribes';


const getFees = async (timestamp: number, _, fetchOptions: FetchOptions): Promise<FetchResultFees> => {
  const {  getFromBlock, getToBlock, } = fetchOptions
  const fromBlock = await getFromBlock()
  const toBlock = await getToBlock()
  const  [feeV2, bribes] = await Promise.all([fetchV2(fromBlock, toBlock,timestamp, fetchOptions),  fees_bribes(fetchOptions)]);
  return {
    ...feeV2,
    dailyBribesRevenue: bribes,
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
