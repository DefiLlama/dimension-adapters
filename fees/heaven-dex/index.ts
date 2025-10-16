import ADDRESSES from '../../helpers/coreAssets.json';
import { Dependencies, FetchOptions, SimpleAdapter } from '../../adapters/types';
import { CHAIN } from '../../helpers/chains';
import { queryDuneSql } from '../../helpers/dune';

const fetch: any = async (_a: any, _b: any, options: FetchOptions) => {

  const query = `
    SELECT 
      SUM(amount_display) as total_amount
    FROM tokens_solana.transfers
    WHERE 
      block_time >= from_unixtime(${options.startTimestamp})
      AND block_time <= from_unixtime(${options.endTimestamp})
      AND to_token_account = '5xUKs45EtfwJAeGAwyvS8WbMebMPY7o334Fi9LxmtyYq'
      AND token_mint_address = 'So11111111111111111111111111111111111111112'
  `
  const res = await queryDuneSql(options, query);
  const dailyFees = options.createBalances();
  dailyFees.add(ADDRESSES.solana.SOL, (res[0].total_amount || 0) * 1e9);

  return { dailyFees, dailyUserFees: dailyFees, dailyHoldersRevenue: dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: '0' };
};


const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.SOLANA],
  dependencies: [Dependencies.DUNE],
  start: '2025-08-13',
  methodology: {
    Fees: 'User pays 0.25%-1% fee on each trade based on marketcap to protocol',
    Revenue: '100% Protocol fees are used for buybacks',
    UserFees: 'User pays 0.25%-1% fee on each trade based on marketcap to protocol',
    HoldersRevenue: '100% of the fees are used for buybacks',
    ProtocolRevenue: 'Protocol doesnt earn anything',
  },
  isExpensiveAdapter: true,
};

export default adapter;
