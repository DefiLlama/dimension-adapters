import { Adapter, FetchOptions, } from '../adapters/types';
import { CHAIN } from '../helpers/chains';
import { queryIndexer, toByteaArray } from '../helpers/indexer';
import { getConfig } from '../helpers/cache';

const PROTOCOL_FEE_LABEL = "Protocol fees";

const fetch: any = async (timestamp: number, _: any, options: FetchOptions) => {

  const dailyFees = options.createBalances()
  const data: string[] = (await getConfig('scatter/fees', 'https://scatter-api.fly.dev/api/contracts')).body;

  const exs = await queryIndexer(`
          SELECT
            '0x' || encode(data, 'hex') AS data,
            value as eth_value
          FROM ethereum.transactions
            WHERE to_address IN ${toByteaArray(data)}
            AND block_time BETWEEN llama_replace_date_range;`, options);
  exs
    .filter((e: any) => e.data.startsWith('0x4a21a2df') || e.data.startsWith('0x1fff79b0'))
    .map((e: any) => dailyFees.addGasToken(e.eth_value * 0.05, PROTOCOL_FEE_LABEL))
  return { dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyFees, timestamp }
}

const methodology = {
  Fees: "5% protocol fee collected on smart contract interactions",
  Revenue: "All protocol fees go to the Scatter treasury",
  ProtocolRevenue: "All protocol fees go to the Scatter treasury"
}

const breakdownMethodology = {
  Fees: {
    [PROTOCOL_FEE_LABEL]: "5% protocol fee charged on smart contract interactions through the Scatter platform"
  },
  Revenue: {
    [PROTOCOL_FEE_LABEL]: "5% protocol fee charged on smart contract interactions, retained by the protocol treasury"
  },
  ProtocolRevenue: {
    [PROTOCOL_FEE_LABEL]: "5% protocol fee charged on smart contract interactions, retained by the protocol treasury"
  }
}

const adapter: Adapter = {
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch,
      start: '2022-07-01', //
    },
  },
  methodology,
  breakdownMethodology
}

export default adapter;
