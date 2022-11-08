import axios from "axios";
import { Adapter, FetchResult, ProtocolType } from "../adapters/types";
import { IDate } from "../helpers/bitqueryFees";
import { CHAIN } from "../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../helpers/getUniSubgraphVolume";
import { getPrices } from "../utils/prices";


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

  const headers =  {"X-API-KEY": process.env.BIT_QUERY_API_KEY || '', "Content-Type": "application/json"};
  const result: ITxAda[] = (await axios.post("https://graphql.bitquery.io", body, { headers: headers }))?.data?.data.cardano.transactions;

  return result;
}
const startTime = 1577836800;
const fetch = async (timestamp: number): Promise<FetchResult> => {
  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000))
  const form = new Date(startTime * 1000).toISOString().split('T')[0];
  const till = new Date(timestamp * 1000).toISOString().split('T')[0];
  const result: ITxAda[] = await adapterQuery(form, till, "cardano");
  const totalFees = result.filter((a: ITxAda) => new Date(a.date.date).getTime() <= new Date(till).getTime()).reduce((a: number, b: ITxAda)=> a + b.feeValue, 0);
  const dailyFees = result.find((a: ITxAda) => new Date(a.date.date).getTime() === new Date(till).getTime())?.feeValue

  const price_id = 'coingecko:cardano'
  const price = (await getPrices([price_id], dayTimestamp))[price_id].price;
  const dailyFeesUsd = (dailyFees || 0) * price;
  const totalFeesUsd = (totalFees * price)
  return {
    timestamp,
    totalFees: totalFeesUsd.toString(),
    dailyFees: dailyFeesUsd.toString(),
  };
};

const adapter: Adapter = {
  adapter: {
    [CHAIN.CARDADO]: {
        fetch: fetch,
        start: async ()  => 1577836800,
    },
  },
  protocolType: ProtocolType.CHAIN
}

export default adapter;
