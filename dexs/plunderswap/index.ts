import fetchURL from "../../utils/fetchURL"
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";
import { CHAIN } from "../../helpers/chains";

const historicalVolumeEndpoint = "https://static.plunderswap.com/volume-history"

interface IVolumeall {
  value: string;
  time: string;
}

const fetch = async ({ createBalances, toTimestamp }: FetchOptions) => {
  const dailyVolume = createBalances()
  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(toTimestamp * 1000))
  const historicalVolume: IVolumeall[] = (await fetchURL(historicalVolumeEndpoint));

  // Format the timestamp without milliseconds
  const targetTime = new Date(dayTimestamp * 1000).toISOString().replace('.000Z', 'Z');

  // Filter entries to find exact 00:00 UTC entry of the current day
  const dayEntries = historicalVolume.filter(entry => {
    return entry.time === targetTime;
  });

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
