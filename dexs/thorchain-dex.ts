import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { httpGet } from "../utils/fetchURL";

const historicalVolumeEndpoint = "https://midgard.ninerealms.com/v2/history/swaps?interval=day&count=400"

interface IVolumeall {
  totalFees: string;
  toAssetFees: string;
  runePriceUSD: string;
  synthRedeemFees: string;
  synthMintFees: string;
  toRuneFees: string;
  totalVolume: string;
  startTime: string;
  toRuneVolume: string;
}

const calVolume = (total: IVolumeall): number => {
  const runePriceUSD = Number(total?.runePriceUSD || 0);
  const volume = Number(total.totalVolume || 0) / 1e8 * runePriceUSD
  return volume;
};

const fetch = async (_a:any, _b:any, options: FetchOptions) => {
  const historicalVolume: IVolumeall[] = (await httpGet(historicalVolumeEndpoint, { headers: {"x-client-id": "defillama"}})).intervals;
  const dailyVolumeCall = historicalVolume.find((dayItem: IVolumeall) => Number(dayItem.startTime) === options.startOfDay);
  const dailyVolume = calVolume(dailyVolumeCall as IVolumeall);

  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.THORCHAIN],
  start: '2022-09-07',
};

export default adapter;