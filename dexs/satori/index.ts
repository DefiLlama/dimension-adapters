import { postURL } from "../../utils/fetchURL"
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";


const DATA_URL = 'https://trade.satori.finance/api/data-center/pub/overview/integration'
interface VolumeInfo {
  fee24h: string;
  tradVol24h: string;
  totalTradVol: string;
  totalUsers: string;
  time: string;
}

const config: any = {
  [CHAIN.POLYGON_ZKEVM]: 'zk',
  [CHAIN.ERA]: 'zksync',
  [CHAIN.LINEA]: 'linea',
  [CHAIN.SCROLL]: 'scroll',
  [CHAIN.BASE]: 'base',
  [CHAIN.ARBITRUM]: 'arbitrum-one',
  [CHAIN.XLAYER]: 'xlayer',
  [CHAIN.PLUME]: 'plume',
  [CHAIN.ZIRCUIT]: 'zircuit',
  [CHAIN.STORY]: 'story',
  [CHAIN.ETHEREUM]: 'ethereum',
  [CHAIN.BSC]: 'bsc',
  [CHAIN.OPTIMISM]: 'optimism',
  [CHAIN.TON]: 'ton',
  [CHAIN.HEMI]: 'hemi',
}

async function fetch({ chain }: FetchOptions) {
  const volumeData: VolumeInfo = (await postURL(DATA_URL, { exchange: config[chain] })).data;

  return {
    dailyVolume: volumeData.tradVol24h,
    dailyFees: volumeData.fee24h,
    dailyRevenue: volumeData.fee24h,
  };
}

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {},
};

Object.keys(config).forEach((chain) => {
  adapter.adapter[chain] = { fetch, runAtCurrTime: true, start: '2023-05-13' }
})

export default adapter;
