import {
  Adapter,
  ChainBlocks,
  FetchOptions,
  ProtocolType,
} from "../../adapters/types";
import { httpPost } from "../../utils/fetchURL";
import { CHAIN } from "../../helpers/chains";
import { getPrices } from "../../utils/prices";

export async function getFeeUSD({ startOfDay }: FetchOptions, url: string) {
  const dailyFees = await httpPost(url, {
    responseType: "blob",
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/74.0.3729.169 Safari/537.36",
      "Content-Type": "text/csv; charset=utf-8",
      Accept: "text/csv; charset=utf-8",
      origin: url,
    },
  });
  const feesToday = dailyFees
    .split("\n")
    .filter((d: any) => d?.split(",")?.[1]?.slice(1, -1) == startOfDay);

  const gasToken = "coingecko:bitcoin";

  return Promise.all(
    feesToday.map(async (fee: any) => {
      const timestamp = Number(fee.split(",")[1].slice(1, -1));
      const prices = await getPrices([gasToken], timestamp);
      const value = Number(fee.split(",")[2].slice(1, -2));
      const amountReal = value / 1e18;
      return (amountReal * prices[gasToken].price).toString();
    })
  );
}

export async function getEtherscanFees(
  { startOfDay }: FetchOptions,
  url: string
) {
  const dailyFees = await httpPost(url, {
    responseType: "blob",
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/74.0.3729.169 Safari/537.36",
      "Content-Type": "text/csv; charset=utf-8",
      Accept: "text/csv; charset=utf-8",
      origin: url,
    },
  });
  const feesToday = dailyFees
    .split("\n")
    .find((d: any) => d?.split(",")?.[1]?.slice(1, -1) == startOfDay);
  return Number(feesToday?.split(",")[2].slice(1, -2));
}

const adapter: Adapter = {
  adapter: {
    [CHAIN.BITLAYER]: {
      fetch: async (
        _timestamp: number,
        _: ChainBlocks,
        options: FetchOptions
      ) => {
        const amount = await getEtherscanFees(
          //精度 应该是18，后端返回值应该知道
          options,
          "https://api.btrscan.com/scan/v1/chain/txForDefillama"
        );

        const feeUSD = await getFeeUSD(
          options,
          "https://api.btrscan.com/scan/v1/chain/txForDefillama"
        );

        console.log("amount", amount);
        console.log("feeUSD", feeUSD);
        const dailyFees = feeUSD.toString();

        return {
          timestamp: options.startOfDay,
          dailyFees,
        };
      },
      start: 1713089236,
    },
  },
  protocolType: ProtocolType.CHAIN,
};
export default adapter;
