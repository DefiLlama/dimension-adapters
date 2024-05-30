import { Adapter, FetchOptions, FetchResultFees } from '../../adapters/types';
import { CHAIN } from '../../helpers/chains';
import { getBribes } from './bribes';
import { getDexFees } from '../../helpers/dexVolumeLogs';

const FACTORY_ADDRESS = '0xbc83f7dF70aE8A3e4192e1916d9D0F5C2ee86367';

const getFees = async (fetchOptions: FetchOptions): Promise<FetchResultFees> => {
  const { getFromBlock, getToBlock } = fetchOptions
  const fromBlock = await getFromBlock()
  const toBlock = await getToBlock()
  const fees = await getDexFees(
    {
      chain: CHAIN.SCROLL,
      factory: FACTORY_ADDRESS,
      fromBlock: fromBlock,
      toBlock: toBlock,
      lengthAbi: 'allPairsLength',
      itemAbi: 'allPairs',
      timestamp: fetchOptions.fromTimestamp,
      fetchOptions: fetchOptions
    }
  )
  const bribesResult = await getBribes(fetchOptions);
  
  return {
    timestamp: fetchOptions.fromTimestamp,
    dailyFees: fees.dailyFees,
    dailyBribesRevenue: bribesResult.dailyBribesRevenue,
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


