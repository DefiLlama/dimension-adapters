import { Adapter, FetchResultFees } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { httpGet } from "../utils/fetchURL";
import { sleep } from "../utils/utils";

const endpoint = "https://api.hiro.so";
const apiKey = "260ff2d24e32b02e69c516779e3ddbf5";

interface Block {
  height: number;
  burn_block_time: number;
}

interface Tx {
  fee_rate: number;
}

interface BlocksResponse {
  results: Block[];
  limit: number;
  offset: number;
}

interface TxsResponse {
  results: Tx[];
}

async function fetchJSON<T>(url: string): Promise<T> {
  try {
    return await httpGet(url, {
      headers: { "x-api-key": apiKey },
    }) as T;
  } catch (error: any) {
    const status = error?.response?.status || error?.status || error?.statusCode || "Unknown";
    const statusText = error?.axiosError || error?.response?.statusText || error?.statusText || error?.message || "Unknown";
    throw new Error(`HTTP ${status} - ${statusText}`);
  }
}

async function getLatestBlocksFees(): Promise<number> {
  const totalBlocksToFetch = 100;
  const maxLimitPerRequest = 30; // API limit
  const batchSize = 20; // number of blocks to fetch per batch
  let totalFees = 0;
  let allBlocks: Block[] = [];
  let offset = 0;

  // Fetch blocks in batches
  while (allBlocks.length < totalBlocksToFetch) {
    const limit = Math.min(maxLimitPerRequest, totalBlocksToFetch - allBlocks.length);
    const blocksData = await fetchJSON<BlocksResponse>(
      `${endpoint}/extended/v1/block?limit=${limit}&offset=${offset}`
    );

    if (blocksData.results.length === 0) break;
    
    allBlocks = allBlocks.concat(blocksData.results);
    offset += blocksData.results.length;

    if (blocksData.results.length < limit) break;
  }

  const blocks = allBlocks.slice(0, totalBlocksToFetch);

  // Process blocks in batches
  for (let i = 0; i < blocks.length; i += batchSize) {
    const batch = blocks.slice(i, i + batchSize);

    // Fetch transactions for all blocks in this batch in parallel
    const txPromises = batch.map((block) =>
      fetchJSON<TxsResponse>(`${endpoint}/extended/v1/tx/block_height/${block.height}`)
    );

    const txResults = await Promise.all(txPromises);

    txResults.forEach((txs) => {
      totalFees += txs.results.reduce((sum, tx) => sum + Number(tx.fee_rate), 0);
    });

    // Small delay between batches to avoid rate limits
    if (i + batchSize < blocks.length) {
      await sleep(100);
    }
  }

  return totalFees / 1e6; // convert microSTX to STX
}

const fetchFees = async (_timestamp: number): Promise<FetchResultFees> => {
  const dailyFees = await getLatestBlocksFees();
  const dailyRevenue = dailyFees; // All fees go to miners

  return {
    timestamp: Math.floor(Date.now() / 1000),
    dailyFees: dailyFees.toString(),
    dailyRevenue: dailyRevenue.toString(),
  };
};

const methodology = {
  Fees: "Total fees collected from the latest 100 blocks on Stacks.",
  Revenue: "All collected fees go to miners.",
};

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.STACKS]: {
      fetch: fetchFees,
      start: 1610582400, // Jan 14, 2021
    },
  },
  methodology,
};

export default adapter;
