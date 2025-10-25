import axios from 'axios';

import { Dependencies, FetchOptions, SimpleAdapter } from '../../adapters/types';
import { CHAIN } from '../../helpers/chains';

const fetch = async (_a:any, _b:any, options: FetchOptions) => {
  const startBlock = await options.getStartBlock();
  const endBlock = await options.getEndBlock();
  const url = `https://api.kensei.one/volumes/by-block?startBlock=${startBlock}&endBlock=${endBlock}`;

  const res = await axios.get<any>(url);
  if (res.status !== 200) {
    throw new Error('Failed to fetch fees');
  }

  let dailyVolume = options.createBalances()

  if (res.status === 200) {
    dailyVolume.addUSDValue(res.data)
  }

  return { dailyVolume }
}

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.KATANA],
  start: '2025-10-16',
  dependencies: [Dependencies.DUNE],
  isExpensiveAdapter: true,
}

export default adapter