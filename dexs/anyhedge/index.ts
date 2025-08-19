import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import fetchURL from "../../utils/fetchURL";
import { CHAIN } from "../../helpers/chains";

const methodology = {
  Volume: "Scan the blockchain for AnyHedge input pattern, add up all such inputs BCH value. The daily volume is the volume of all settled contracts for the day. Indexer: https://gitlab.com/0353F40E/anyhedge-stats",
}

interface IAnyhedgeVolumeResponse {
  daily_volume: number;
  total_volume: number;
}

// day formatted as 2011-12-13
export const anyhedgeVolumeEndpoint = (day: string) => {
  // Data & calculation method is fully reproducible, see:
  // https://gitlab.com/0353F40E/anyhedge-stats/-/blob/master/readme.md
  return "https://gitlab.com/0353F40E/anyhedge-stats/-/raw/master/stats_daily/" + day + ".csv";
}

const fetchAnyhedgeVolumeData: any = async (timestamp: number, _: any, options: FetchOptions) => {
  const dayString = new Date(timestamp * 1000).toISOString().slice(0,10);
  const anyhedgeVolumeData = await getAnyhedgeVolumeData(anyhedgeVolumeEndpoint(dayString));
  
  const dailyVolume = options.createBalances();
  dailyVolume.addCGToken('bitcoin-cash', Number(anyhedgeVolumeData?.daily_volume));

  return {
    timestamp,
    dailyVolume,
  };
}

async function getAnyhedgeVolumeData(endpoint: string): Promise<IAnyhedgeVolumeResponse | null> {
  try {
    let data = await fetchURL(endpoint);
    data = parseCSV(data);
    const retval: IAnyhedgeVolumeResponse = {} as IAnyhedgeVolumeResponse;
    retval.daily_volume = data[0].volume_closed;
    retval.total_volume = data[0].volume_closed_cumulative;
    return retval;
  } catch {
      return null;
  }
}

function parseCSV(csvData) {
  csvData = csvData.replaceAll('\r', '').split('\n').map(i => i.split(','))
  const headers = csvData.shift()
  const retval = csvData.map(row => toObject(headers, row));
  return retval;
}

function toObject(keys, values) {
  const res = {}
  keys.forEach((key, i) => {
    res[key] = values[i]
  })
  return res
}

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.BITCOIN_CASH]: {
      fetch: fetchAnyhedgeVolumeData,
      start: '2022-06-09',
    },
  },
  methodology,
};
export default adapter;
