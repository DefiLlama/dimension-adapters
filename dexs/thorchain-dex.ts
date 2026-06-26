import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { httpGet } from "../utils/fetchURL";


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

const fetch = async (options: FetchOptions) => {
  const url = `https://gateway.liquify.com/chain/thorchain_midgard/v2/history/swaps?interval=day&from=${options.startOfDay}&to=${options.endTimestamp}`;
  const historicalVolume: IVolumeall[] = (await httpGet(url, { headers: {"x-client-id": "defillama"}})).intervals;
  const dailyVolumeCall = historicalVolume.find((dayItem: IVolumeall) => Number(dayItem.startTime) === options.startOfDay);
  const dailyVolume = calVolume(dailyVolumeCall as IVolumeall);

  return { dailyVolume };
};

const methodology = {
  Volume: "Total USD value of swaps executed through THORChain's liquidity pools, sourced from THORChain Midgard. Every swap routes through native RUNE and settles on the THORChain L1, so volume is reported on the THORChain chain. Daily RUNE-denominated swap volume is converted to USD using that day's RUNE price.",
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.THORCHAIN],
  start: '2021-04-11',
  methodology,
};

export default adapter;
