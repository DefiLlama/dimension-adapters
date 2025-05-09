import fetchURL from "../../utils/fetchURL"
import { FetchResultOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const volumeEndpoint = 'https://tradeparadigm.metabaseapp.com/api/public/dashboard/e4d7b84d-f95f-48eb-b7a6-141b3dcef4e2/dashcard/7734/card/6988'

interface IVolumeData {
  data: {
    rows: [string, string, number][];
  }
}

const fetch = async (timestamp: number): Promise<FetchResultOptions> => {
  const volumesData = await fetchURL(volumeEndpoint) as IVolumeData
  const timestampStr = new Date(timestamp * 1000).toISOString().split('T')[0] + "T00:00:00Z"
  
  // Find the Perp_Option data for the requested date
  const dailyVolume = volumesData.data.rows.find(row => ((row[0] === timestampStr) && (row[1] === 'Perp_Option')))?.[2]
  
  if (!dailyVolume) throw new Error('Perp_Option record missing for date: ' + timestampStr)
  
  // Calculate total volume by summing all Perp_Option volumes up to the requested date
  const totalVolume = volumesData.data.rows
    .filter(row => (row[1] === 'Perp_Option' && row[0] <= timestampStr))
    .reduce((sum, row) => sum + row[2], 0);
  
  return { 
    timestamp,
    dailyNotionalVolume: dailyVolume,
    totalNotionalVolume: totalVolume
  };
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch,
      start: '2025-03-29',
    },
  },
};

export default adapter;