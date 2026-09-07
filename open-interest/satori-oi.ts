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
  chains: [CHAIN.POLYGON_ZKEVM],
  fetch,
  start: '2023-05-13',
  runAtCurrTime: true,
  // Same DNS-dead host as the volume leg, which was marked dead in daa93f11d. This leg kept
  // reporting until 2026-07-07 because open interest was the last field the API still served.
  // Satori's own vaults on Polygon zkEVM hold 0 USDC and the Ethereum ones were emptied on
  // 2026-07-23, so there is no position left for it to report.
  deadFrom: '2026-07-08',
};

export default adapter;
