import fetchURL, { httpGet } from "../../utils/fetchURL"
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const historicalVolumeEndpoint = "https://abc.endjgfsv.link/swap/scan/volumeall"

interface IVolumeall {
  volume: string;
  time: number;
}

const fetchHistorical = async (_timestamp: number, _: any, { dateString }: FetchOptions) => {
  const historicalVolume: IVolumeall[] = (await fetchURL(historicalVolumeEndpoint)).data;
  console.log(`Fetched historical volume data for ${historicalVolume.length} days, ${dateString}`);
  const tsToString = (ts: number) => new Date(ts).toISOString().split("T")[0];

  const dailyVolume = historicalVolume
    .find(dayItem => tsToString(dayItem.time) === dateString)!.volume

  return {
    dailyVolume,
  };
};

async function fetch() {
  const { data: { list } } = await httpGet('https://abc.endjgfsv.link/swap/v2/exchanges/scan?pageNo=1&orderBy=volume24hrs&desc=true&pageSize=1000')
  console.log(list.length, "exchanges found")
  let dailyVolume = 0
  list.forEach((item: { volume24hrs: number; liquidity: number }) => {
    const volTvlRatio = item.volume24hrs / item.liquidity;
    console.log(`Volume: ${item.volume24hrs}, TVL: ${item.liquidity}, Ratio: ${volTvlRatio}`);
    if (volTvlRatio < 100) { // filter out scam volume
      dailyVolume += +item.volume24hrs;
    }
  });

  return { dailyVolume }
}

const adapter: SimpleAdapter = {
  fetch,
  runAtCurrTime: true,
  chains: [CHAIN.TRON],
};

export default adapter;
