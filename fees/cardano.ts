import { Adapter, ChainBlocks, FetchOptions, FetchResult, ProtocolType } from "../adapters/types";
import { IDate } from "../helpers/bitqueryFees";
import { CHAIN } from "../helpers/chains";
import { getTimestampAtStartOfDayUTC, getTimestampAtStartOfNextDayUTC } from "../utils/date";
import { httpPost } from "../utils/fetchURL";
import { getEnv } from "../helpers/env";


interface ITxAda {
  date: IDate;
  feeValue: number;
}

const adapterQuery = async (form: string, till: string, network: string): Promise<ITxAda[]> => {
  const queryTemplate = `query ($network: CardanoNetwork!, $dateFormat: String!, $from: ISO8601DateTime, $till: ISO8601DateTime) {
    cardano(network: $network) {
      transactions(options: {asc: "date.date"}, date: {since: $from, till: $till}) {
        date: date {
          date(format: $dateFormat)
        }
        feeValue
      }
    }
  }`

  const value = { limit: 1000, offset: 0, network: network, from: form, till: till, dateFormat: "%Y-%m-%d" };
  const body = JSON.stringify({
    query: queryTemplate,
    variables: value
  });

  const headers =  {"X-API-KEY": getEnv('BIT_QUERY_API_KEY'), "Content-Type": "application/json"};
  const result: ITxAda[] = (await httpPost("https://graphql.bitquery.io", body, { headers: headers }))?.data.cardano.transactions;

  return result;
}
const startTime = 1577836800;
const fetch = async (timestamp: number , _: ChainBlocks, { createBalances }: FetchOptions): Promise<FetchResult> => {
  const dailyFees = createBalances()
  const dayTimestamp = getTimestampAtStartOfDayUTC(timestamp);
  const startTimestamp = getTimestampAtStartOfDayUTC(startTime);
  const tillTimestamp = getTimestampAtStartOfNextDayUTC(timestamp);
  const form = new Date(startTimestamp * 1000).toISOString().split('T')[0];
  const till = new Date((tillTimestamp - 1) * 1000).toISOString();
  const result: ITxAda[] = await adapterQuery(form, till, "cardano");
  const totalFees = result.filter((a: ITxAda) => new Date(a.date.date).getTime() <= new Date(till).getTime()).reduce((a: number, b: ITxAda)=> a + b.feeValue, 0);
  const _dailyFees = result.find((a: ITxAda) => (getTimestampAtStartOfDayUTC(new Date(a.date.date).getTime()) /1000) === getTimestampAtStartOfDayUTC(new Date(dayTimestamp).getTime()))?.feeValue
  dailyFees.addCGToken('cardano', _dailyFees)
  return {
    timestamp,
    dailyFees,
    // totalFees,
  };
};

const adapter: Adapter = {
  adapter: {
    [CHAIN.CARDANO]: {
        fetch: fetch,
        start: 1577836800,
    },
  },
  protocolType: ProtocolType.CHAIN
}

export default adapter;
