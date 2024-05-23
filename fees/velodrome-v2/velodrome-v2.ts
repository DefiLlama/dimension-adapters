import { FetchOptions, FetchResultFees } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getDexFees } from "../../helpers/dexVolumeLogs";

const FACTORY_ADDRESS = '0xF1046053aa5682b4F9a81b5481394DA16BE5FF5a';

export const fetchV2 = async (fromBlock: number, toBlock: number, timestamp: number, fetchOptions: FetchOptions): Promise<any> => {
  return getDexFees({ chain: CHAIN.OPTIMISM, fromBlock, toBlock, factory: FACTORY_ADDRESS, timestamp, lengthAbi: 'allPoolsLength', itemAbi: 'allPools', fetchOptions })
}
