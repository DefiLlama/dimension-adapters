import * as sdk from "@defillama/sdk";
import { Chain, FetchResultV2 } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { Adapter, Dependencies, FetchOptions } from "../adapters/types";
import { formatAddress, sleep } from "../utils/utils";
import { getDefaultDexTokensBlacklisted } from "../helpers/lists";
import { queryAllium } from "../helpers/allium";

type IConfig = {
  [s: string | Chain]: {
    routerAddress: string;
    getTrasnactionLimit: number;
    start: string;
  };
}

export const configs: IConfig = {
  [CHAIN.ETHEREUM]: {
    routerAddress: '0x881d40237659c251811cec9c364ef91dc08d300c',
    getTrasnactionLimit: 5000,
    start: '2023-01-01',
  },
  [CHAIN.POLYGON]: {
    routerAddress: '0x1a1ec25dc08e98e5e93f1104b5e5cdd298707d31',
    getTrasnactionLimit: 5000,
    start: '2023-01-01',
  },
  [CHAIN.BSC]: {
    routerAddress: '0x1a1ec25dc08e98e5e93f1104b5e5cdd298707d31',
    getTrasnactionLimit: 5000,
    start: '2023-01-01',
  },
  [CHAIN.ARBITRUM]: {
    routerAddress: '0x9dda6ef3d919c9bc8885d5560999a3640431e8e6',
    getTrasnactionLimit: 10000,
    start: '2023-01-01',
  },
  [CHAIN.OPTIMISM]: {
    routerAddress: '0x9dda6ef3d919c9bc8885d5560999a3640431e8e6',
    getTrasnactionLimit: 10000,
    start: '2023-01-01',
  },
  [CHAIN.BASE]: {
    routerAddress: '0x9dda6ef3d919c9bc8885d5560999a3640431e8e6',
    getTrasnactionLimit: 5000,
    start: '2023-11-18',
  },
  [CHAIN.LINEA]: {
    routerAddress: '0x9dda6ef3d919c9bc8885d5560999a3640431e8e6',
    getTrasnactionLimit: 10000,
    start: '2023-10-03',
  },
  [CHAIN.AVAX]: {
    routerAddress: '0x1a1ec25dc08e98e5e93f1104b5e5cdd298707d31',
    getTrasnactionLimit: 10000,
    start: '2023-01-01',
  },
  [CHAIN.MONAD]: {
    routerAddress: '0x962287c9d5b8a682389e61edae90ec882325d08b',
    getTrasnactionLimit: 10000,
    start: '2025-10-01',
  },
  [CHAIN.HYPERLIQUID]: {
    routerAddress: '0xb165c4d4b8044d4a9276c3d75f08cd6a2874a3b2',
    getTrasnactionLimit: 10000,
    start: '2026-01-13',
  },
  // MetaMask's Bridge API (bridge.api.cx.metamask.io/getQuote, chain 4663) quotes swaps with trade.to = this router,
  // selector 0x5f575529 and an 87.5 bps fee to 0x932B4d3D0261f907cf94Be547ccBDC0e8B6be90A
  [CHAIN.ROBINHOOD]: {
    routerAddress: '0xf5307745c61de69bf033edfe6a8771256275a323',
    getTrasnactionLimit: 10000,
    start: '2026-07-10',
  },
}

// MetaMask's Solana fee wallets (extension, mobile). A swap pays one of them in the same transaction, which is
// how fees/metamask.ts already identifies MetaMask activity on Solana - the volume side simply had
// no Solana leg, so the chain reports fees while reporting no swap volume at all.
// On 2026-09-30 (15:21-15:31 UTC) the fees moved from the first pair to the second, which was also MetaMask's
// fee pair before 2025-08-12. Source: `feeData.metabridge.recipient` in MetaMask's Bridge API quotes (87.5 bps).
// Sample fees: 24NJ4BtLQcxHPhQ1r7euLr4ZCiBvTs45haGiKoCSM8r5uZZmuEiDMkohWPYiPTmmfySbCXASiK46P7swXoBUMKqA (4cLUBQ),
// 3dRLkN3JyKrTqDsAhixDfCbaTx6dTpQtvvD8gk2vnBB1MCMVUt91wDzVNYk3LupRr9uzLjiHSw7Uikej6m4AVigQ (8ZCzZn).
export const SOLANA_FEE_WALLETS = [
  '47YRE7eLAdYzvGqSH1XLg2o8xUtywk7sS5BKv1oR4Y7i', // extension, until 2026-09-30
  'HbBHuvgWoChfztoqz2izLRF5mSoLKQXfU68kueBmhcmL', // mobile, until 2026-09-30
  '4cLUBQKZgCv2AqGXbh8ncGhrDRcicUe3WSDzjgPY2oTA', // extension, from 2026-09-30
  '8ZCzZnSxhbZp2oBGYYUeXMwqHCsAweXdgvyqNrAzGHWV', // mobile, from 2026-09-30
];

// Only transactions that also carry a decoded swap count. The same wallets collect bridge fees,
// and a bridge has no swap notional behind it. Transactions signed by a fee wallet are excluded:
// until 2026-09-30 the first pair swept its fees to the second every day at 22:00 UTC with Jupiter
// swaps it signed itself, and those are not user swaps.
export const fetchSolana = async (options: FetchOptions): Promise<FetchResultV2> => {
  const wallets = SOLANA_FEE_WALLETS.map((wallet) => `'${wallet}'`).join(', ');
  const query = `
    WITH metamask_txs AS (
      SELECT DISTINCT txn_id
      FROM solana.assets.transfers
      WHERE to_address IN (${wallets})
        AND signer NOT IN (${wallets})
        AND block_timestamp >= TO_TIMESTAMP_NTZ(${options.startTimestamp})
        AND block_timestamp < TO_TIMESTAMP_NTZ(${options.endTimestamp})
    ),
    hop_dedup AS (
      SELECT t.usd_amount
      FROM solana.dex.trades t
      INNER JOIN metamask_txs m ON t.txn_id = m.txn_id
      WHERE t.block_timestamp >= TO_TIMESTAMP_NTZ(${options.startTimestamp})
        AND t.block_timestamp < TO_TIMESTAMP_NTZ(${options.endTimestamp})
      QUALIFY ROW_NUMBER() OVER (
        PARTITION BY t.txn_id, t.instruction_index
        ORDER BY t.usd_amount DESC
      ) = 1
    )
    SELECT COALESCE(SUM(usd_amount), 0) AS volume
    FROM hop_dedup
  `;

  const data = await queryAllium(query);
  return { dailyVolume: data[0]?.volume ?? 0 };
}

async function retry(chain: string, fromBlock: number, toBlock: number, address: string): Promise<Array<any>> {
  for (let i = 0; i < 5; i++) {
    try {
      return (await sdk.indexer.getTransactions({
        chain: chain,
        from_block: fromBlock,
        to_block: toBlock,
        transactionType: 'to',
        addresses: [address],
      })) as Array<any>;
    } catch (e: any) {
      if (i === 4) {
        throw e;
      }
    }
    await sleep(5000); // sleep 5 secs
  }

  return [];
}

export const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
  const dailyVolume = options.createBalances()

  const blacklistTokens: Array<string> = getDefaultDexTokensBlacklisted(options.chain)
  
  const limit = configs[options.chain].getTrasnactionLimit
  let blockNumber = Number(options.fromApi.block);

  for (blockNumber; blockNumber <= Number(options.toApi.block); blockNumber += limit + 1) {
    const toBlock = blockNumber + limit > Number(options.toApi.block) ? Number(options.toApi.block) : blockNumber + limit;
    const transactions = await retry(options.chain, blockNumber, toBlock, configs[options.chain].routerAddress);

    if (!transactions) continue; // no transactions found

    for (const transaction of transactions.filter(tx => tx.status === 1)) {
      const data = transaction.input.replace('0x5f575529', '');
      const address = data.slice(64, 128);
      const amount = Number('0x' + data.slice(128, 192));
      const tokenAddress = '0x' + address.slice(24, address.length);
      
      if (!blacklistTokens.includes(formatAddress(tokenAddress))) {
        dailyVolume.add(tokenAddress, amount);
      }
    }
  }

  const dailyFees = dailyVolume.clone(0.0085)

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  }
}

const adapter: Adapter = {
  version: 2,
  pullHourly: true,
  fetch,
  adapter: {
    ...configs,
    [CHAIN.SOLANA]: { fetch: fetchSolana, start: '2025-08-12' },
  },
  dependencies: [Dependencies.ALLIUM],
  isExpensiveAdapter: true,
}

export default adapter;
