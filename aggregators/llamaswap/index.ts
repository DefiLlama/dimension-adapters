import fetchURL from "../../utils/fetchURL";
import { FetchOptions, FetchResult, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const URL = "https://api.llama.fi/";

const chains = [
  CHAIN.ETHEREUM,
  CHAIN.BSC,
  CHAIN.POLYGON,
  CHAIN.OPTIMISM,
  CHAIN.ARBITRUM,
  CHAIN.AVAX,
  "gnosis",
  CHAIN.FANTOM,
  CHAIN.KLAYTN,
  CHAIN.AURORA,
  CHAIN.CELO,
  CHAIN.CRONOS,
  CHAIN.DOGECHAIN,
  CHAIN.MOONRIVER,
  "bttc",
  CHAIN.OASIS,
  CHAIN.VELAS,
  CHAIN.HECO,
  CHAIN.HARMONY,
  CHAIN.BOBA,
  CHAIN.OKEXCHAIN,
  CHAIN.FUSE,
  CHAIN.MOONBEAM,
  CHAIN.CANTO,
  CHAIN.ZKSYNC,
  "polygonzkevm",
  "ontology",
  CHAIN.KAVA,
  CHAIN.PULSECHAIN,
  CHAIN.METIS,
  CHAIN.BASE,
];

const fetch = async (timestamp: number, _: any, options: FetchOptions): Promise<FetchResult> => {
  const chain = options.chain
  if (chain === CHAIN.HECO) { return {} } // skip HECO for now

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
