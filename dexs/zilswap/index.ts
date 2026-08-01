import fetchURL from "../../utils/fetchURL"
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const historicalVolumeEndpoint = "https://api.zilstream.com/volume"

interface IVolumeall {
  value: string;
  time: string;
}

const fetch = async ({ createBalances, startOfDay }: FetchOptions) => {
  const dailyVolume = createBalances()
  const historicalVolume: IVolumeall[] = (await fetchURL(historicalVolumeEndpoint));
  const _dailyVolume = historicalVolume.filter(volItem => (new Date(volItem.time.split('T')[0]).getTime() / 1000) === startOfDay);
  const __dailyVolume = Math.abs(Number(_dailyVolume[0].value) - Number(_dailyVolume[_dailyVolume.length - 1].value))
  dailyVolume.addCGToken("zilliqa", __dailyVolume)
  return { dailyVolume, };
};

const adapter: SimpleAdapter = {
  fetch,
  chains: [CHAIN.ZILLIQA],
  runAtCurrTime: true,
  start: '2023-01-07',
};

export default adapter;
