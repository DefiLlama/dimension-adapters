
import { SimpleAdapter, FetchOptions } from "../../adapters/types"; import { CHAIN } from "../../helpers/chains"
import { httpPost } from "../../utils/fetchURL";
interface IData {
  create_time: string;
  volume_usd_24h: string;
  swap_fee_24h: string;
}

const fetch = async (options: FetchOptions) => {
  const url = "https://noahark.pro/api/swap/get1dSnapshot";
  const body = {
    type: "month"
  }
  const res: IData[] = (await httpPost(url, body, { headers: { "Chainid": 17777 } })).data as IData[];
  const dayItem = res.find(item => item.create_time.split('T')[0] === options.dateString);
  if (!dayItem) {
    throw new Error('Missing data')
  }
  const dailyVolume = dayItem.volume_usd_24h;
  const dailyFees = dayItem.swap_fee_24h;

  return {
    dailyVolume: dailyVolume,
    dailyFees
  }
}

const adapters: SimpleAdapter = {
  fetch,
  chains: [CHAIN.EOS_EVM],
  start: '2023-11-07',
}

export default adapters
