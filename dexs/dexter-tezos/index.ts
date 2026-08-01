import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";

let _data: any

async function getData() {
  if (!_data)
    _data = httpGet("https://github.com/StableTechnologies/usdtz-stats/blob/main/temp/dollarizedRevenue_3.json")

  return _data
}

const fetch = async (options: FetchOptions) => {

  const date = new Date(options.startOfDay * 1000).toLocaleDateString()
  const data = (await getData())[date]
  if (!data) throw new Error("No data found for date " + date)
  return {
    dailyVolume: data.volume,
  }
}


const adapter: SimpleAdapter = {
  fetch,
  chains: [CHAIN.TEZOS],
}

export default adapter;
