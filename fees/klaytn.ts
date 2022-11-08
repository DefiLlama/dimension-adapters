import axios from "axios";
import { Adapter, FetchResult, ProtocolType } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getPrices } from "../utils/prices";

interface IDate {
  date: string;
}

interface ITx {
  date: IDate;
  gasValue: number;
}

const startTime = 1577836800;

const adapterQuery = async (form: string, till: string, network: string): Promise<ITx[]> => {
  const queryTemplate = `query ($network: EthereumNetwork!, $dateFormat: String!, $from: ISO8601DateTime, $till: ISO8601DateTime) {
    ethereum(network: $network) {
      transactions(options: {asc: "date.date"}, date: {since: $from, till: $till}) {
        date: date {
          date(format: $dateFormat)
        }
        gasValue
      }
    }
  }`

  const value = { limit: 1000, offset: 0, network: network, from: form, till: till, dateFormat: "%Y-%m-%d" };
  const body = JSON.stringify({
    query: queryTemplate,
    variables: value
  });

  const headers =  {"X-API-KEY": process.env.BIT_QUERY_API_KEY || '', "Content-Type": "application/json"};
  const result: ITx[] = (await axios.post("https://graphql.bitquery.io", body, { headers: headers }))?.data?.data.ethereum.transactions;

  return result;
}

const fetch = async (timestamp: number): Promise<FetchResult> => {
  const form = new Date(startTime * 1000).toISOString().split('T')[0];
  const till = new Date(timestamp * 1000).toISOString().split('T')[0];
  const result: ITx[] = await adapterQuery(form, till, "klaytn");
  const totalFees = result.filter((a: ITx) => new Date(a.date.date) <= new Date(till)).reduce((a: number, b: ITx)=> a + b.gasValue, 0);
  const dailyFees = result.find((a: ITx) => new Date(a.date.date) <= new Date(till))?.gasValue
  const price_id = 'coingecko:klay-token'
  const price = (await getPrices([price_id], timestamp))[price_id].price;
  return {
    timestamp,
    totalFees: (totalFees * price).toString(),
    dailyFees: (dailyFees || 0 * price).toString()
  };
};

const adapter: Adapter = {
  adapter: {
    [CHAIN.KLAYTN]: {
        fetch: fetch,
        start: async ()  => 1577836800,
    },
  },
  protocolType: ProtocolType.CHAIN
}

export default adapter;
