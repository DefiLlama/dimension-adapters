import { PromisePool } from "@supercharge/promise-pool";
import { Adapter, FetchOptions, ProtocolType } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getEnv } from "../../helpers/env";
import { METRIC } from "../../helpers/metrics";
import { httpGet } from "../../utils/fetchURL";

const PRL_COINGECKO_ID = "pearl-2";
const GRAINS_PER_PRL = 1e8;
const PAGE_SIZE = 1000;
const BLOCK_FETCH_CONCURRENCY = 4;

type BlockbookStatus = {
  blockbook: {
    bestHeight: number;
  };
};

type BlockTransaction = {
  fees?: string;
};

type BlockResponse = {
  hash: string;
  height: number;
  time: number;
  totalPages?: number;
  txs?: BlockTransaction[];
};

const blockCache: Record<string, BlockResponse> = {};

function getBlockbookApi() {
  const api = getEnv("PEARL_BLOCKBOOK_API");
  if (!api) throw new Error("Missing PEARL_BLOCKBOOK_API env");
  return api.replace(/\/+$/, "");
}

async function getLatestHeight() {
  const status: BlockbookStatus = await httpGet(getBlockbookApi());
  return Number(status.blockbook.bestHeight);
}

async function getBlock(blockId: string | number, page = 1) {
  const cacheKey = `${blockId}-${page}`;
  if (!blockCache[cacheKey]) {
    blockCache[cacheKey] = await httpGet(`${getBlockbookApi()}/block/${blockId}?page=${page}&pageSize=${PAGE_SIZE}`);
  }

  return blockCache[cacheKey];
}

async function getBlockByHeight(height: number) {
  return getBlock(height);
}

async function findFirstBlockAtOrAfter(timestamp: number, latestHeight: number) {
  let low = 0;
  let high = latestHeight + 1;

  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    const block = await getBlockByHeight(mid);

    if (Number(block.time) >= timestamp) {
      high = mid;
    } else {
      low = mid + 1;
    }
  }

  return low;
}

async function getBlockFeesInGrains(height: number) {
  const firstPage = await getBlockByHeight(height);
  let totalFees = sumTxFees(firstPage.txs);
  const totalPages = Number(firstPage.totalPages || 1);

  for (let page = 2; page <= totalPages; page++) {
    const blockPage = await getBlock(firstPage.hash, page);
    totalFees += sumTxFees(blockPage.txs);
  }

  return totalFees;
}

function sumTxFees(txs: BlockTransaction[] = []) {
  return txs.reduce((sum, tx) => sum + Number(tx.fees || 0), 0);
}

const fetch = async (options: FetchOptions) => {
  const latestHeight = await getLatestHeight();
  const startHeight = await findFirstBlockAtOrAfter(options.startTimestamp, latestHeight);
  const endHeight = await findFirstBlockAtOrAfter(options.endTimestamp, latestHeight);
  const blockHeights = Array.from(
    { length: endHeight - startHeight },
    (_, index) => startHeight + index,
  );

  const { results: blockFees, errors } = await PromisePool
    .withConcurrency(BLOCK_FETCH_CONCURRENCY)
    .for(blockHeights)
    .process(getBlockFeesInGrains);
  if (errors.length) throw errors[0];

  const totalFeesInGrains = blockFees.reduce((sum, fees) => sum + fees, 0);

  const dailyFees = options.createBalances();
  dailyFees.addCGToken(PRL_COINGECKO_ID, totalFeesInGrains / GRAINS_PER_PRL, METRIC.TRANSACTION_GAS_FEES);

  return {
    dailyFees,
  };
};

const adapter: Adapter = {
  version: 2,
  fetch,
  pullHourly: true,
  chains: [CHAIN.PEARL],
  start: "2026-04-29",
  protocolType: ProtocolType.CHAIN,
  skipBreakdownValidation: true,
  methodology: {
    Fees: "Transaction fees paid by users on Pearl.",
  },
};

export default adapter;
