import { Adapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";
import { getPrices } from "../../utils/prices";

const toki = (n:any) =>"starknet:0x"+BigInt(n).toString(16).padStart("049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7".length, "0")

const fetch = async (timestamp: number) => {
  const response =  ((await fetchURL("https://mainnet-api.ekubo.org/overview")).data.topPairs as any[])
    .map(t=>([{token: toki(t.token0), vol: t.volume0_24h}, {token: toki(t.token1), vol: t.volume1_24h}])).flat()
  const prices = await getPrices(response.map(t=>t.token), timestamp)
  const dailyVolume = response.map((token) => {
    const price = prices[token.token]
    if(price === undefined){ return 0 }
    const usdVal = Number(token.vol) * price.price / (10**price.decimals)
    return usdVal
  }).reduce((a: number, b: number) => a+b,0);
  return {
    timestamp: timestamp,
    dailyVolume: `${dailyVolume}`,
  };
}

const adapter: Adapter = {
  adapter: {
    [CHAIN.STARKNET]: {
      fetch: fetch,
      runAtCurrTime: true,
      start: async () => 1695081600
    },
  }
}

export default adapter;
