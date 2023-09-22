import { Adapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import fetchURL from "../utils/fetchURL";
import { getPrices } from "../utils/prices";

const toki = (n:any) =>"starknet:0x"+BigInt(n).toString(16).padStart("049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7".length, "0")

async function getDimension(responseRaw:any[], key: string, timestamp:number){
  const response =  responseRaw
    .map(t=>({token: toki(t.token), vol: t[key]}))
  const prices = await getPrices(response.map(t=>t.token), timestamp)
  return response.map((token) => {
    const price = prices[token.token]
    if(price === undefined){ return 0 }
    const usdVal = Number(token.vol) * price.price / (10**price.decimals)
    return usdVal
  }).reduce((a: number, b: number) => a+b,0);
}

const fetch = async (timestamp: number) => {
  const fees = await getDimension((await fetchURL("https://mainnet-api.ekubo.org/overview")).data.volumeByToken_24h, "fees", timestamp)
  const rev = await getDimension((await fetchURL("https://mainnet-api.ekubo.org/overview")).data.revenueByToken_24h, "revenue", timestamp)
  return {
    timestamp: timestamp,
    dailyFees: `${fees}`,
    dailyRevenue: `${rev}`,
  };
}

const adapter: Adapter = {
  adapter: {
    [CHAIN.STARKNET]: {
      fetch: fetch,
      runAtCurrTime: true,
      start: async () => 1695168000
    },
  }
}

export default adapter;
