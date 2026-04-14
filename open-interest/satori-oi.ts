import { postURL } from "../utils/fetchURL"
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";


const DATA_URL = 'https://trade.satori.finance/api/data-center/pub/analytics/dashboard/integration'
interface VolumeInfo {
  openInterestVol: string;
}

const config: any = {
  [CHAIN.POLYGON_ZKEVM]: 'zk',
}

const fetch = async ({ chain }: FetchOptions) => {
  const volumeData: VolumeInfo = (await postURL(DATA_URL, { exchange: config[chain] })).data;

  return {
    openInterestAtEnd: volumeData.openInterestVol,
  };
}

const adapter: SimpleAdapter = {
  version: 2,
  chains: [CHAIN.SATORI],
  fetch,
  start: '2023-05-13',
  runAtCurrTime: true,
};

export default adapter;
