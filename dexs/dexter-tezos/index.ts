import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";

let _data: any

async function getData() {
  if (!_data)
    _data = httpGet("https://github.com/StableTechnologies/usdtz-stats/blob/main/temp/dollarizedRevenue_3.json")

  return _data
}

const fetchVolume = async (_: any, _t: any, options: FetchOptions) => {

  const date = new Date(options.startOfDay * 1000).toLocaleDateString()
  const data = (await getData())[date]
  if (!data) throw new Error("No data found for date " + date)
  return {
    dailyVolume: data.volume,
    timestamp: options.startOfDay,
  }
}


const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.TEZOS]: {
      fetch: fetchVolume,
    }
  }
}

export default adapter;
