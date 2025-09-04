import fetchURL, { fetchURLAutoHandleRateLimit } from "../../utils/fetchURL"
import { FetchResultVolume, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";

const metaDataEndpoint = "https://pro.edgex.exchange/api/v1/public/meta/getMetaData"
const klineDailyEndpoint = (contractId: string, startTime: number, endTime: number) => `https://pro.edgex.exchange/api/v1/public/quote/getKline?contractId=${contractId}&klineType=DAY_1&filterBeginKlineTimeInclusive=${startTime}&filterEndKlineTimeExclusive=${endTime}&priceType=LAST_PRICE`
const openInterestEndpoint = "https://pro.edgex.exchange/api/v1/public/quote/getTicketSummary?period=LAST_DAY_1"

interface KlineData {
  contractId: string;
  contractName: string;
  klineType: string;
  klineTime: string;
  priceType: string;
  trades: string;
  size: string;
  value: string;
}

interface ResponseData {
  dataList: KlineData[];
}

interface ApiResponse {
  code: string;
  data: ResponseData;
  msg: string | null;
  errorParam: string | null;
}

function parseContractIds(response: any): string[] {
  return response.data.contractList.map(contract => contract.contractId);
}


const fetch = async (timestamp: number): Promise<FetchResultVolume> => {
  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000)) * 1000
  const toTimestamp = dayTimestamp + 60 * 60 * 24 * 1000;
  const contractIds: string[] = parseContractIds(await fetchURL(metaDataEndpoint));
  const klines: Array<any> = [];
  for (const contractId of contractIds) {
    const response: ApiResponse = await fetchURLAutoHandleRateLimit(klineDailyEndpoint(contractId, dayTimestamp, toTimestamp), 5);
    klines.push(response.data.dataList);
  }
  const oi = await fetchURL(openInterestEndpoint);
  const volumes = klines
    .flat()
    .map(kline => parseFloat(kline.value))
    .reduce((acc, value) => acc + value, 0);
  return { dailyVolume: volumes, openInterestAtEnd: oi.data.tickerSummary.openInterest };
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.EDGEX]: {
      fetch,
      start: '2024-08-06',
    },
  },
};

export default adapter;
