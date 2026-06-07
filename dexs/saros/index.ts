import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

import { httpPost } from "../../utils/fetchURL"

async function fetch({ startTimestamp, dateString }: FetchOptions) {
  const { data } = await httpPost('https://api.saros.xyz/api/saros/pool/total', {
    "from": (startTimestamp - 86400) * 1000
  })
  const item = data.find((dayItem: any) => dayItem.from.startsWith(dateString))
  if (!item) throw new Error(`No data for date: ${dateString}`)
  return { dailyVolume: item.volume }
}

const adapter: SimpleAdapter = {
  fetch,
  chains: [CHAIN.SOLANA],
};
export default adapter;
