
import { SimpleAdapter } from "../../adapters/types"
import { CHAIN } from "../../helpers/chains"
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";
import { httpPost } from "../../utils/fetchURL";
interface IData {
  create_time: string;
  volume_usd_24h: string;
  swap_fee_24h: string;
}

const fetchVolume = async (timestamp: number) => {
  const url = "https://noahark.pro/api/swap/get1dSnapshot";
  const body = {
    type: "month"
  }
  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000));
  const dateString = new Date(timestamp * 1000).toISOString().split("T")[0];
  const res: IData[] = (await httpPost(url, body, { headers: { "Chainid": 17777 }})).data as IData[];
  const dayItem = res.find(item => item.create_time.split('T')[0] === dateString);
  if (!dayItem) {
    throw new Error('Missing data')
  }
  const dailyVolume = dayItem.volume_usd_24h;
  const dailyFees = dayItem.swap_fee_24h;
  return {
    dailyVolume: dailyVolume,
    dailyFees,
    timestamp
  }
}
const adapters: SimpleAdapter  = {
  adapter: {
    [CHAIN.EOS_EVM]: {
      fetch: fetchVolume,
      start: '2023-11-07'
    }
  }
}

export default adapters
