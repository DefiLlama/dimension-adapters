import { Adapter, FetchOptions, } from '../adapters/types';
import { CHAIN } from '../helpers/chains';
import { queryIndexer, toByteaArray } from '../helpers/indexer';
import { getConfig } from '../helpers/cache';

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
    .map((e: any) => dailyFees.addGasToken(e.eth_value * 0.05))
  return { dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyFees, timestamp }
}

const adapter: Adapter = {
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch,
      start: '2022-07-01', //
    },
  }
}

export default adapter;
