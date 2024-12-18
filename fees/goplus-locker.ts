import { Adapter, FetchOptions, } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryIndexer } from "../helpers/indexer";
import ADDRESSES from '../helpers/coreAssets.json';

const CHAIN_CONFIG = {
  [CHAIN.ETHEREUM]: { start: 20790869 },
  [CHAIN.BSC]: { start: 42387186 },
  [CHAIN.BASE]: { start: 20014325 },
  [CHAIN.ARBITRUM]: { start: 279127453 },
  // [CHAIN.GRAVITY]: { start: 23719062 },
  // [CHAIN.MORPH]: { start: 1125634 }
}

const fetch: any = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();

  // add native fee
  let feeTo = "0x521faAcDFA097ad35a32387727e468F7fD032fD6";

  await options.api.sumTokens({ owner: feeTo, token: ADDRESSES.null });
  await options.fromApi.sumTokens({ owner: feeTo, token: ADDRESSES.null });
  dailyFees.addBalances(options.api.getBalancesV2());
  dailyFees.subtract(options.fromApi.getBalancesV2());

  if( options.chain in CHAIN_CONFIG) {
    let startBlock = CHAIN_CONFIG[ options.chain as keyof typeof CHAIN_CONFIG].start;
    const transfer_logs = await queryIndexer(`
      SELECT
        encode(data, 'hex') AS data,
        encode(contract_address, 'hex') as contract_address
      FROM
        ethereum.event_logs
      WHERE
        block_number > ${startBlock}
        AND topic_0 = '\\xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'
        AND topic_2 = '\\x000000000000000000000000${feeTo.replace("0x", "").toLowerCase()}'
        AND block_time BETWEEN llama_replace_date_range;
        `, options);
    transfer_logs.map((a: any) => dailyFees.add('0x' + a.contract_address, Number('0x' + a.data)));
  }


  return { dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyFees, }
}

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.ETHEREUM]: { fetch, start: '2024-09-20', },
    [CHAIN.BSC]: { fetch, start: '2024-09-19', },
    [CHAIN.BASE]: { fetch, start: '2024-09-20', },
    [CHAIN.ARBITRUM]: { fetch, start: '2024-11-28', },
    [CHAIN.GRAVITY]: { fetch, start: '2024-12-11', },
    [CHAIN.MORPH]: { fetch, start: '2024-12-11', },
  },

}

export default adapter;
