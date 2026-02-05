import { Dependencies, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";
import { FetchOptions } from "../../adapters/types";

interface IData {
  burned_tokens: string;
}

const fetch = async (_: any, _1: any, options: FetchOptions) => {
  const tokenAddress = options.chain === CHAIN.BASE
    ? '0x52c2b317eb0bb61e650683d2f287f56c413e4cf6'
    : '0xba25b2281214300e4e649fead9a6d6acd25f1c0a';

  const data: IData[] = await queryDuneSql(options, `
    SELECT 
      CAST(SUM(value) AS VARCHAR) AS burned_tokens
    FROM erc20_${options.chain}.evt_Transfer
    WHERE contract_address = ${tokenAddress}
      AND to = 0x000000000000000000000000000000000000dEaD
      AND evt_block_time >= FROM_UNIXTIME(${options.startTimestamp})
      AND evt_block_time < FROM_UNIXTIME(${options.endTimestamp})
      AND value <= CAST(100000 * POWER(10, 18) AS UINT256)  -- 100k cap to remove treasury burns
  `);

  const dailyFees = options.createBalances();

  if (data && data.length > 0 && data[0].burned_tokens !== '0') {
    const burnedAmount = data[0].burned_tokens;
    dailyFees.add(tokenAddress, burnedAmount);
  }

  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: '0',
    dailyHoldersRevenue: dailyFees,
  };
};

const fetchSolana = async (_: any, _1: any, options: FetchOptions) => {
  const data: IData[] = await queryDuneSql(options, `
    SELECT 
      CAST(COALESCE(SUM(amount), 0) AS VARCHAR) AS burned_tokens
    FROM spl_token_solana.spl_token_call_burn
    WHERE account_mint = '9gaCDFUN1Kvz1YfocbcowtzZq8PCebdfgT5AmJz5yEVY'
      AND call_block_time >= FROM_UNIXTIME(${options.startTimestamp})
      AND call_block_time < FROM_UNIXTIME(${options.endTimestamp})
      AND amount <= 100000 * POWER(10, 8)  -- 100k cap to remove treasury burns
  `);

  const dailyFees = options.createBalances();

  if (data && data.length > 0 && data[0].burned_tokens !== '0') {
    const burnedAmount = data[0].burned_tokens;
    dailyFees.addCGToken('tree-capital', Number(burnedAmount) / 1e8);
  }

  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: '0',
    dailyHoldersRevenue: dailyFees,
  };
};

const methodology = {
  Fees: "All funds spent by users to subscribe. Includes direct token burns, and USDC used to buy and burn.",
  UserFees: "All funds spent by users to subscribe. Includes direct token burns, and USDC used to buy and burn.",
  Revenue: "All tokens burned by users for subscriptions.",
  ProtocolRevenue: "Treasury doesn't earn any revenue as everything is burned.",
  HoldersRevenue: "100% of subscriptions are burned, benefitting all holders of the token.",
}

const adapter: SimpleAdapter = {
  dependencies: [Dependencies.DUNE],
  adapter: {
    [CHAIN.ETHEREUM]: {fetch, start: '2024-11-01'},
    [CHAIN.BASE]: { fetch, start: '2024-11-01' },
    [CHAIN.SOLANA]: { fetch: fetchSolana, start: '2025-07-27' }
  },
  methodology,
  isExpensiveAdapter: true
};

export default adapter;