import { Adapter, FetchOptions, } from '../adapters/types';
import { CHAIN } from '../helpers/chains';
import { queryIndexer } from '../helpers/indexer';

// order example https://explorer.cow.fi/orders/0x6926d210ec9c5a9acb36db99842b10cd9ad328d391fcc42d23cf49bfb1b17720d7f876620bdff1c9aba5b444128d1722ddd678b367083dfb?tab=overview
const fetch: any = async (options: FetchOptions) => {
    const dailyFees = options.createBalances()

    const eth_transfer_logs: any = await queryIndexer(`
  SELECT
    sum("value") AS eth_value
  FROM
    ethereum.traces
  WHERE
    to_address = '\\x63695Eee2c3141BDE314C5a6f89B98E62808d716'
    AND block_time BETWEEN llama_replace_date_range;
    `, options);
    eth_transfer_logs.map((e: any) => dailyFees.addGasToken(e.eth_value ?? 0))
    return { dailyFees, dailyRevenue: dailyFees }
}

const adapter: Adapter = {
    version: 2,
    adapter: {
        [CHAIN.ETHEREUM]: {
            fetch,
            start: 0,
        },
    }
}

export default adapter;
