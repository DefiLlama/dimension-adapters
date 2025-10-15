import ADDRESSES from '../../helpers/coreAssets.json'
import { FetchOptions, FetchResult } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";

const list_of_mints: string[] = [
  ADDRESSES.solana.SOL,
  "3NZ9JMVBmGAqocybic2c7LQCJScmgsAZ6vQqTDzcqmJh",
  "7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs",
]

const fetch = async (timestamp: number, _a: any, options: FetchOptions): Promise<FetchResult> => {
  const header_user = {
    "accept": "*/*",
    "accept-language": "en-US,en;q=0.9",
    "content-type": "application/json",
    "sec-ch-ua": "\" Not A;Brand\";v=\"99\", \"Chromium\";v=\"90\", \"Google Chrome\";v=\"90\"",
    "sec-ch-ua-mobile": "?0",
    "sec-fetch-dest": "empty",
    "sec-fetch-mode": "cors",
    "sec-fetch-site": "cross-site",
    "sec-gpc": "1",
    "referrer": "https://www.jup.ag/",
    "referrerPolicy": "strict-origin-when-cross-origin",
    "mode": "cors",
    "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/90.0.4430.212 Safari/537.36",
  }
  const url = (token: string) => `https://perp-api.jup.ag/trpc/tradeVolume?batch=1&input={"0":{"json":{"mint":"${token}"}}}`
  const fetches = (await Promise.all(list_of_mints.map(token => httpGet(url(token), { headers: header_user })))).flat();
  const dailyVolume = fetches.reduce((acc, { result }) => acc + result.data.json.volume, 0);

  // // Fetch JLP pool info for open interest calculation
  // const jlpInfoUrl = 'https://perps-api.jup.ag/v1/jlp-info';
  // const jlpInfo = await httpGet(jlpInfoUrl, { headers: header_user });
  
  // const openInterest = jlpInfo.custodies.reduce((acc: number, custody: any) => {
  //   const utilizationPct = custody.utilizationPct;
  //   const aumUsdFormatted = parseFloat(custody.aumUsdFormatted);
  //   return acc + (utilizationPct * aumUsdFormatted / 100);
  // }, 0);

  return {
    dailyVolume,
    // openInterestAtEnd: openInterest,
    // timestamp: timestamp,
  };
};

const adapter = {
  version: 2,
  fetch,
  chains: [CHAIN.SOLANA],
  runAtCurrTime: true,
  start: "2024-01-23",
};

export default adapter;
