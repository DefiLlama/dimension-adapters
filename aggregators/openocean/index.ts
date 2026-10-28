import { CHAIN } from "../../helpers/chains";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { getEnv } from "../../helpers/env";
import { httpGet } from "../../utils/fetchURL";
import { sleep } from "../../utils/utils";

// https://docs.de1.exchange/docs/overview/supported-chains
const URL = "https://open-api-pro.de1.exchange/v3";

// De1 429s when every chain hits getDailyVolume at once (runAdapter uses Promise.all).
const REQUEST_GAP_MS = 1500;
let requestQueue: Promise<unknown> = Promise.resolve();

const queuedHttpGet = (url: string, options?: Parameters<typeof httpGet>[1]) => {
  const result = requestQueue.then(() => httpGet(url, options));
  requestQueue = result.catch(() => undefined).then(() => sleep(REQUEST_GAP_MS));
  return result;
};

const chainConfig: Record<string, { chainCode: string; start: string }> = {
  [CHAIN.ETHEREUM]: { chainCode: "eth", start: "2022-01-01" },
  [CHAIN.BSC]: { chainCode: "bsc", start: "2022-01-01" },
  [CHAIN.ARBITRUM]: { chainCode: "arbitrum", start: "2022-01-01" },
  [CHAIN.BASE]: { chainCode: "base", start: "2022-01-01" },
  [CHAIN.POLYGON_ZKEVM]: { chainCode: "polygon_zkevm", start: "2022-01-01" },
  [CHAIN.HYPERLIQUID]: { chainCode: "hyperevm", start: "2022-01-01" },
  [CHAIN.POLYGON]: { chainCode: "polygon", start: "2022-01-01" },
  [CHAIN.AVAX]: { chainCode: "avax", start: "2022-01-01" },
  [CHAIN.FANTOM]: { chainCode: "fantom", start: "2022-01-01" },
  [CHAIN.OPTIMISM]: { chainCode: "optimism", start: "2022-01-01" },
  [CHAIN.ERA]: { chainCode: "zksync", start: "2022-01-01" },
  [CHAIN.OP_BNB]: { chainCode: "opbnb", start: "2022-01-01" },
  [CHAIN.LINEA]: { chainCode: "linea", start: "2022-01-01" },
  [CHAIN.MANTLE]: { chainCode: "mantle", start: "2022-01-01" },
  [CHAIN.MANTA]: { chainCode: "manta", start: "2022-01-01" },
  [CHAIN.TELOS]: { chainCode: "telos", start: "2022-01-01" },
  [CHAIN.SCROLL]: { chainCode: "scroll", start: "2022-01-01" },
  [CHAIN.XDAI]: { chainCode: "xdai", start: "2022-01-01" },
  [CHAIN.CRONOS]: { chainCode: "cronos", start: "2022-01-01" },
  [CHAIN.HARMONY]: { chainCode: "harmony", start: "2022-01-01" },
  [CHAIN.BLAST]: { chainCode: "blast", start: "2022-01-01" },
  [CHAIN.MODE]: { chainCode: "mode", start: "2022-01-01" },
  [CHAIN.ROOTSTOCK]: { chainCode: "rootstock", start: "2022-01-01" },
  [CHAIN.SEI]: { chainCode: "sei", start: "2022-01-01" },
  [CHAIN.GRAVITY]: { chainCode: "gravity", start: "2022-01-01" },
  [CHAIN.KAVA]: { chainCode: "kava", start: "2022-01-01" },
  [CHAIN.METIS]: { chainCode: "metis", start: "2022-01-01" },
  [CHAIN.CELO]: { chainCode: "celo", start: "2022-01-01" },
  [CHAIN.MOONRIVER]: { chainCode: "moonriver", start: "2022-01-01" },
  [CHAIN.AURORA]: { chainCode: "aurora", start: "2022-01-01" },
  [CHAIN.APECHAIN]: { chainCode: "ape", start: "2022-01-01" },
  [CHAIN.SONIC]: { chainCode: "sonic", start: "2022-01-01" },
  [CHAIN.BERACHAIN]: { chainCode: "bera", start: "2022-01-01" },
  [CHAIN.UNICHAIN]: { chainCode: "uni", start: "2022-01-01" },
  [CHAIN.FLARE]: { chainCode: "flare", start: "2022-01-01" },
  [CHAIN.SWELLCHAIN]: { chainCode: "swell", start: "2022-01-01" },
  [CHAIN.MONAD]: { chainCode: "monad", start: "2025-05-17" },
  [CHAIN.SOLANA]: { chainCode: "solana", start: "2025-05-17" },
  //not listed on De1 Swap API: https://docs.de1.exchange/docs/overview/supported-chains
  [CHAIN.APTOS]: { chainCode: "aptos", start: "2025-05-17" },
  [CHAIN.SUI]: { chainCode: "sui", start: "2025-05-17" },
  [CHAIN.NEAR]: { chainCode: "near", start: "2025-05-17" },
  [CHAIN.STARKNET]: { chainCode: "starknet", start: "2025-05-17" },
  [CHAIN.ROBINHOOD]: { chainCode: "robinhood", start: "2026-05-17" },
};

const fetch = async (options: FetchOptions) => {
  const { chainCode } = chainConfig[options.chain];

  const apiKey = getEnv("DE1_API_KEY");
  if (!apiKey) throw new Error("DE1_API_KEY is not set");

  const res = await queuedHttpGet(
    `${URL}/${chainCode}/getDailyVolume?timestamp=${options.startOfDay}`,
    { headers: { apikey: apiKey } },
  );

  const dailyVolume = res?.data?.dailyVolume;
  if (dailyVolume == null) throw new Error(`OpenOcean API missing dailyVolume for ${options.chain}`);

  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  adapter: chainConfig,
};

export default adapter;
