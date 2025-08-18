import fetchURL from "../../utils/fetchURL";
import { FetchOptions, FetchResult, SimpleAdapter } from "../../adapters/types";

const URL = "https://api.llama.fi/";

const chains = [
  "ethereum",
  "bsc",
  "polygon",
  "optimism",
  "arbitrum",
  "avax",
  "gnosis",
  "fantom",
  "klaytn",
  "aurora",
  "celo",
  "cronos",
  "dogechain",
  "moonriver",
  "bttc",
  "oasis",
  "velas",
  "heco",
  "harmony",
  "boba",
  "okexchain",
  "fuse",
  "moonbeam",
  "canto",
  "zksync",
  "polygonzkevm",
  "ontology",
  "kava",
  "pulse",
  "metis",
  "base",
];

const fetch = async (timestamp: number, _: any, options: FetchOptions): Promise<FetchResult> => {
  const chain = options.chain
  if (chain === 'heco') { return {} } // skip HECO for now

  const dailyVolume = await fetchURL(
    `${URL}getSwapDailyVolume/?timestamp=${timestamp}&chain=${chain}`
  );

  return {
    dailyVolume: dailyVolume.volume,
  };
}

const adapter: SimpleAdapter = {
  version: 1,
  adapter: {},
};

chains.map((chain) => {
  adapter.adapter[chain] = {
    fetch,
    start: '2023-01-04',
  };
});

export default adapter;
