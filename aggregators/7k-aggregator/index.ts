import fetchURL from '../../utils/fetchURL';
import { FetchV2, SimpleAdapter } from '../../adapters/types';
import { CHAIN } from '../../helpers/chains';

import { FetchResult } from "../../adapters/types";

const fetch = async (chain: string): Promise<FetchResult> => {
  try {
    // 根据链选择相应的接口
    const url = `http://starbase/data/get?chain=${chain}`;
    const response = await fetch(url);
    const data = await response.json();

    // 假设返回的数据结构如下：
    // {
    //   '1d_change': 5.2,
    //   '7d_change': 12.3,
    //   'volume_24h': 1000000,
    //   'volume_7d': 7000000
    // }

    return {
      dailyVolume: data.volume_24h,
      timestamp: Math.floor(Date.now() / 1000), // 当前时间的 Unix 时间戳
    };
  } catch (error) {
    console.error('获取数据失败:', error);
    throw new Error('获取数据失败');
  }
};

const adapter = {
  timetravel: false,
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch: fetch,
      runAtCurrTime: true,
      start: '2023-12-05',
    },
    [CHAIN.BASE]: {
      fetch: fetch,
      runAtCurrTime: true,
      start: '2023-12-05',
    },
    [CHAIN.BSC]: {
      fetch: fetch,
      runAtCurrTime: true,
      start: '2023-12-05',
    },
  },
  isExpensiveAdapter: true,
};

export default adapter;

