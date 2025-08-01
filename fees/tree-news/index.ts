import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";
import { FetchOptions } from "../../adapters/types";

interface IData {
  burned_tokens: string;
}

const fetchEVM = async (_a: any, _b: any, options: FetchOptions) => {
  // Determine token address based on chain
  const tokenAddress = options.chain === CHAIN.BASE 
    ? '0x52c2b317eb0bb61e650683d2f287f56c413e4cf6'  // Base token
    : '0xba25b2281214300e4e649fead9a6d6acd25f1c0a'; // Ethereum token

  const data: IData[] = await queryDuneSql(options, `
    SELECT 
      CAST(SUM(value) AS VARCHAR) AS burned_tokens
    FROM erc20_${options.chain}.evt_Transfer
    WHERE contract_address = ${tokenAddress}
      AND to = 0x000000000000000000000000000000000000dEaD  -- Dead address
      AND evt_block_time >= FROM_UNIXTIME(${options.startTimestamp})
      AND evt_block_time < FROM_UNIXTIME(${options.endTimestamp})
      AND value <= CAST(100000 * POWER(10, 18) AS UINT256)  -- 100k cap to remove treasury burns
  `);

  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();

  // Process the results
  if (data && data.length > 0 && data[0].burned_tokens !== '0') {
    const burnedAmount = data[0].burned_tokens;
    
    dailyFees.add(tokenAddress, burnedAmount);
    dailyRevenue.add(tokenAddress, burnedAmount);
    dailyHoldersRevenue.add(tokenAddress, burnedAmount);
  }

  return {
    dailyFees,
    dailyRevenue,
    dailyHoldersRevenue,
  };
};

const fetchSolana = async (_a: any, _b: any, options: FetchOptions) => {
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
  const dailyRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();
  // Process the results
  if (data && data.length > 0 && data[0].burned_tokens !== '0') {
    const burnedAmount = data[0].burned_tokens;
    
    dailyFees.add('9gaCDFUN1Kvz1YfocbcowtzZq8PCebdfgT5AmJz5yEVY', burnedAmount);
    dailyRevenue.add('9gaCDFUN1Kvz1YfocbcowtzZq8PCebdfgT5AmJz5yEVY', burnedAmount);
    dailyHoldersRevenue.add('9gaCDFUN1Kvz1YfocbcowtzZq8PCebdfgT5AmJz5yEVY', burnedAmount);
  }
  return {
    dailyFees,
    dailyRevenue,
    dailyHoldersRevenue,
  };
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch: fetchEVM,
      start: '2024-11-01',
      meta: {
        methodology: {
          Fees: "All funds spent by users to subscribe. Includes direct token burns, and USDC used to buy and burn.",
          Revenue: "All tokens burned by users for subscriptions.",
          HoldersRevenue: "100% of subscriptions are burned, benefitting all holders of the token.",
        }
      }
    },
    [CHAIN.BASE]: {
      fetch: fetchEVM,
      start: '2024-11-01',
      meta: {
        methodology: {
          Fees: "All funds spent by users to subscribe. Includes direct token burns, and USDC used to buy and burn.",
          Revenue: "All tokens burned by users for subscriptions.",
          HoldersRevenue: "100% of subscriptions are burned, benefitting all holders of the token.",
        }
      }
    },
    [CHAIN.SOLANA]: {
      fetch: fetchSolana,
      start: '2025-08-01',
      meta: {
        methodology: {
          Fees: "All funds spent by users to subscribe. Includes direct token burns, and USDC used to buy and burn.",
          Revenue: "All tokens burned by users for subscriptions.",
          HoldersRevenue: "100% of subscriptions are burned, benefitting all holders of the token.",
        }
      }
    }
  },
  version: 1,
  isExpensiveAdapter: true
};

export default adapter;