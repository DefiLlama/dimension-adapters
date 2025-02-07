import { FetchOptions, FetchResult, FetchResultV2 } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";

const list_of_mints: string[] = [
  "So11111111111111111111111111111111111111112",
  "3NZ9JMVBmGAqocybic2c7LQCJScmgsAZ6vQqTDzcqmJh",
  "7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs",
]

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
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

  // https://station.jup.ag/guides/perpetual-exchange/how-it-works#base-fee
  const fee = (0.06/100);
  const dailyFees = options.createBalances()
  dailyFees.addUSDValue(dailyVolume * fee);
  return {
    dailyFees: dailyFees
  };
};

const adapter = {
  version: 2,
  breakdown: {
    derivatives: {
      [CHAIN.SOLANA]: {
        fetch,
        runAtCurrTime: true,
        start: '2024-01-23',
      },
    },
  }
};
export default adapter;
