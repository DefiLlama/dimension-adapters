import { httpPost } from "../utils/fetchURL";
import { getEnv } from "./env";

interface IDate {
  date: string; // ex. 2022-01-01
}

interface ITx {
  date: IDate;
  gasValue: number;
}


type EthereumNetwork = 'ethereum' | 'ethclassic' | 'ethpow' | 'ethclassic_reorg' | 'celo_alfajores' | 'celo_baklava' | 'celo_rc1' | 'bsc' | 'bsc_testnet' | 'goerli' | 'matic' | 'velas' | 'velas_testnet' | 'klaytn' | 'avalanche' | 'fantom' | 'moonbeam';
const adapterBitqueryFeesEthereumNetwork = async (form: string, till: string, network: EthereumNetwork): Promise<ITx[]> => {
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

  const headers =  {"X-API-KEY": getEnv('BIT_QUERY_API_KEY'), "Content-Type": "application/json"};
  const result: ITx[] = (await httpPost("https://graphql.bitquery.io", body, { headers: headers }))?.data.ethereum.transactions;

  return result;
}
export {
  IDate,
  ITx,
  adapterBitqueryFeesEthereumNetwork
}
