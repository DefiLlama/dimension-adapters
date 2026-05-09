import { SimpleAdapter, FetchOptions, ProtocolType } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet, httpPost } from "../../utils/fetchURL";

const GOLDSKY_GQL = "https://arweave-search.goldsky.com/graphql";
const AVG_BLOCK_TIME_S = 130; // ~2 min average Arweave block time
const PAGE_SIZE = 100;
const MAX_PAGES_PER_RANGE = 300;
const PARALLEL_RANGES = 5;
const WINSTON_PER_AR = 1e12;

const estimateBlock = (targetTs: number, tipHeight: number, tipTs: number): number =>
  Math.max(0, tipHeight - Math.round((tipTs - targetTs) / AVG_BLOCK_TIME_S));

const fetchRangeWinston = async (minBlock: number, maxBlock: number): Promise<number> => {
  let totalWinston = 0;
  let cursor: string | undefined;

  for (let page = 0; page < MAX_PAGES_PER_RANGE; page++) {
    const query = `{
      transactions(
        block: { min: ${minBlock}, max: ${maxBlock} }
        bundledIn: null
        first: ${PAGE_SIZE}
        ${cursor ? `after: "${cursor}"` : ""}
      ) {
        pageInfo { hasNextPage }
        edges { cursor node { fee { winston } } }
      }
    }`;

    const res = await httpPost(GOLDSKY_GQL, { query });
    const txData = res?.data?.transactions ?? {};
    const edges: any[] = txData.edges ?? [];

    for (const e of edges) totalWinston += Number(e.node?.fee?.winston ?? 0);

    if (!txData.pageInfo?.hasNextPage || edges.length === 0) break;
    cursor = edges[edges.length - 1]?.cursor;
  }

  return totalWinston;
};

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();

  const info = await httpGet("https://arweave.net/info");
  const tipHeight: number = info.height;
  const tipTs = Math.floor(Date.now() / 1000);

  const startBlock = estimateBlock(options.startTimestamp, tipHeight, tipTs);
  const endBlock = estimateBlock(options.endTimestamp, tipHeight, tipTs);

  const totalBlocks = endBlock - startBlock + 1;
  const rangeSize = Math.ceil(totalBlocks / PARALLEL_RANGES);

  const subRanges: [number, number][] = Array.from({ length: PARALLEL_RANGES }, (_, i) => {
    const min = startBlock + i * rangeSize;
    const max = Math.min(min + rangeSize - 1, endBlock);
    return [min, max] as [number, number];
  }).filter(([min, max]) => min <= max);

  const winstonByRange = await Promise.all(
    subRanges.map(([min, max]) => fetchRangeWinston(min, max))
  );
  const totalAR = winstonByRange.reduce((sum, w) => sum + w, 0) / WINSTON_PER_AR;

  dailyFees.addCGToken("arweave", totalAR);

  return { dailyFees };
};

const methodology = {
  Fees: "Total transaction fees paid by users for base-layer Arweave transactions. Excludes bundled data items (which pay zero fees individually). Data sourced from Goldsky's Arweave GraphQL index.",
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.ARWEAVE],
  start: "2018-06-08",
  protocolType: ProtocolType.CHAIN,
  methodology,
};

export default adapter;
