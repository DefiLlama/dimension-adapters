import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import fetchURL from "../utils/fetchURL";

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const date = new Date(options.startOfDay * 1000).toISOString().slice(0, 10);
  const payload = String(await fetchURL("https://app.carbon.inc/analytics")).match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/)?.[1];
  if (!payload) throw new Error("Carbon analytics page missing __NEXT_DATA__ payload");

  const oi = JSON.parse(payload).props.pageProps.intentXFEOIAnalytics["8453"]
    .find((i: any) => i.date === date)?.totalOI;
  if (oi == null) throw new Error(`Carbon OI missing for ${date}`);

  return { openInterestAtEnd: Number(oi) };
};

export default {
  version: 1,
  chains: [CHAIN.BASE],
  fetch,
  start: "2025-07-09",
} as SimpleAdapter;
