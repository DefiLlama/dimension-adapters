import {
  Adapter,
  FetchOptions,
  ProtocolType,
} from "../../adapters/types";
import { httpPost } from "../../utils/fetchURL";
import { CHAIN } from "../../helpers/chains";
import { time } from "console";

export async function getFeeUSD({ startOfDay, createBalances }: FetchOptions, url: string) {
    const dailyFees = createBalances()
    const response = await httpPost(url, {
        responseType: 'blob', headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/74.0.3729.169 Safari/537.36",
            "Content-Type": "text/csv; charset=utf-8",
            "Accept": "text/csv; charset=utf-8",
            "origin": url,
        }
    });
    const feesToday = response
      .split("\n")
      .filter((d: any) => d?.split(",")?.[1]?.slice(1, -1) == startOfDay);

  const gasToken = "coingecko:bitcoin";
  feesToday.forEach((fee: any) => {
    const value = Number(fee.split(",")[2].slice(1, -2));
    const amountReal = value / 1e18;
    dailyFees.addCGToken(gasToken, amountReal);
  });
  return dailyFees;
}

const adapter: Adapter = {
  version: 1,
  adapter: {
    [CHAIN.BITLAYER]: {
      fetch: async (_t: any, _b: any, options: FetchOptions) => {
        const url = "https://api.btrscan.com/scan/v1/chain/txForDefillama";
        return {
          timestamp: options.startOfDay,
          dailyFees: (await getFeeUSD(options,url)),
        };
      },
      start: 1713089236,
    },
  },
  protocolType: ProtocolType.CHAIN,
};
export default adapter;
