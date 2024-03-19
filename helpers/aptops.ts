import { httpGet } from "../utils/fetchURL";

export const APTOS_PRC = 'https://aptos-mainnet.pontem.network';

const getResources = async (account: string): Promise<any[]> => {
  const data: any = []
  let lastData: any;
  let cursor
  do {
    let url = `${APTOS_PRC}/v1/accounts/${account}/resources?limit=9999`
    if (cursor) url += '&start=' + cursor
    const res = await httpGet(url, undefined, { withMetadata: true })
    lastData = res.data
    data.push(...lastData)
    cursor = res.headers['x-aptos-cursor']
  } while (lastData.length === 9999)
  return data
}

export {
  getResources
}
