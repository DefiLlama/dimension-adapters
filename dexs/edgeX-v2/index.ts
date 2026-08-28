import { PromisePool } from "@supercharge/promise-pool";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL, { fetchURLAutoHandleRateLimit } from "../../utils/fetchURL";
import { sleep } from "../../utils/utils";

const META_ENDPOINT = "https://edgex-prod-v2.edgex.exchange/api/v2/public/meta/getMetaData";
const klineEndpoint = (contractId: string, startTime: number, endTime: number) =>
  `https://edgex-prod-v2.edgex.exchange/api/v2/public/quote/getKline?contractId=${contractId}&klineType=DAY_1&filterBeginKlineTimeInclusive=${startTime}&filterEndKlineTimeExclusive=${endTime}&priceType=LAST_PRICE`;

const fetch = async (options: FetchOptions) => {
  const metadata = await fetchURL(META_ENDPOINT);
  const contracts: { contractId: string }[] = metadata.data.contractList.filter((contract: { enableTrade: boolean; enableDisplay: boolean }) => contract.enableTrade && contract.enableDisplay);
  const startTime = options.startOfDay * 1000;
  const endTime = options.endTimestamp * 1000;

  const { results } = await PromisePool.withConcurrency(2)
    .for(contracts)
    .process(async (contract: { contractId: string }) => {
      const response = await fetchURLAutoHandleRateLimit(klineEndpoint(contract.contractId, startTime, endTime));
      await sleep(500);
      if (!response.data.dataList.length) return 0;
      return response.data.dataList.map((kline: { value: string }) => Number(kline.value)).reduce((total: number, volume: number) => total + volume);
    });

  return { dailyVolume: results.reduce((total: number, volume: number) => total + volume) };
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.EDGEX],
  start: "2026-05-12",
};

export default adapter;
