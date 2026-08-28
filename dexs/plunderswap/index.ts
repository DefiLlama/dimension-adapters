import fetchURL from "../../utils/fetchURL"
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const historicalVolumeEndpoint = "https://static.plunderswap.com/volume-history"

interface IVolumeall {
  value: string;
  time: string;
}

const fetch = async ({ createBalances, startOfDay }: FetchOptions) => {
  const dailyVolume = createBalances()
  const historicalVolume: IVolumeall[] = (await fetchURL(historicalVolumeEndpoint));
  const targetTime = new Date(startOfDay * 1000).toISOString().replace('.000Z', 'Z');
  const dayEntries = historicalVolume.filter(entry => entry.time === targetTime);

  if (dayEntries.length > 0) {
    dailyVolume.addCGToken("zilliqa", Number(dayEntries[0].value));
  }

  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  fetch,
  chains: [CHAIN.ZILLIQA],
  start: '2024-12-10',
};

export default adapter;
