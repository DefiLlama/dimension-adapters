import { Adapter, FetchResultFees } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { httpGet } from "../utils/fetchURL";

const endpoint = "https://api.hiro.so";
const apiKey = "260ff2d24e32b02e69c516779e3ddbf5";

const ADDRESS = "SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4";

interface Block {
  height: number;
  burn_block_time: number;
}

interface BlocksResponse {
  results: Block[];
}

interface StxBalanceResponse {
  total_fees_sent: string; // microSTX
}

async function fetchJSON<T>(url: string): Promise<T> {
  return httpGet(url, {
    headers: { "x-api-key": apiKey },
  }) as Promise<T>;
}

async function getLatestBlockHeight(): Promise<number> {
  const res = await fetchJSON<BlocksResponse>(
    `${endpoint}/extended/v1/block?limit=1`
  );
  return res.results[0].height;
}

async function getBlockByHeight(height: number): Promise<Block> {
  return fetchJSON<Block>(
    `${endpoint}/extended/v1/block/by_height/${height}`
  );
}

async function getBlockHeightAt(timestamp: number): Promise<number> {
  let low = 1;
  let high = await getLatestBlockHeight();
  let result = 0;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const block = await getBlockByHeight(mid);

    if (block.burn_block_time <= timestamp) {
      result = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  if (result === 0) {
    throw new Error(`No block found at or before timestamp ${timestamp}`);
  }

  return result;
}

async function getFeesUntilBlock(blockHeight: number): Promise<number> {
  const res = await fetchJSON<StxBalanceResponse>(
    `${endpoint}/extended/v1/address/${ADDRESS}/stx?until_block=${blockHeight}`
  );
  return Number(res.total_fees_sent);
}

const fetchFees = async ({
  startTimestamp,
  endTimestamp,
}: {
  startTimestamp: number;
  endTimestamp: number;
}): Promise<FetchResultFees> => {
  const startBlock = await getBlockHeightAt(startTimestamp);
  const endBlock = await getBlockHeightAt(endTimestamp);

  const feesStart = await getFeesUntilBlock(startBlock);
  const feesEnd = await getFeesUntilBlock(endBlock);

  const dailyFees = (feesEnd - feesStart) / 1e6; // microSTX → STX

  return {
    dailyFees,
    dailyRevenue: dailyFees,
  };
};

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.STACKS]: {
      fetch: fetchFees,
      start: "2025-01-01",
    },
  },
  methodology: {
    Fees: "Total daily fees paid to execute transactions on Stacks.",
    Revenue: "Total daily fees collected by miners on Stacks.",
  },
};

export default adapter;
