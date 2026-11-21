import { httpGet, httpPost } from "../utils/fetchURL";

// Kadena (community edition since the 2025-11-08 fork) is 20 braided proof-of-work chains.
// Node run by the community: https://kda-chain.org/developers.html
const API = 'https://api.chainweb-community.org/chainweb/0.0/mainnet01';
export const KADENA_CHAIN_COUNT = 20;
const HEADER_ACCEPT = { headers: { accept: 'application/json;blockheader-encoding=object' } };
// chains stay within a few blocks of each other, so the height range found on chain 0 plus this
// margin covers the window on every chain. It is checked per chain, never assumed.
const HEIGHT_MARGIN = 40;
const MAX_PAGES = 500;

type Tip = { height: number, hash: string };
type Window = { startTimestamp: number, endTimestamp: number };

export type KadenaTransaction = {
  cmd: any       // the signed command: meta (sender, gasPrice, gasLimit...), payload, signers
  output: any    // the result: gas used, result status, events
};

export type KadenaBlock = {
  chainId: number
  height: number
  timestamp: number // creation time in seconds
  transactions: KadenaTransaction[]
};

const decode = (base64Url: string) => JSON.parse(Buffer.from(base64Url, 'base64url').toString('utf8'));

// Pact numbers come back as plain numbers, or as { decimal } / { int } when they do not fit a double
export const kadenaNumber = (value: any, field: string, where: string): number => {
  const raw = value !== null && typeof value === 'object' ? (value.decimal ?? value.int) : value;
  const parsed = Number(raw);
  if (raw === undefined || raw === null || raw === '' || !Number.isFinite(parsed) || parsed < 0) throw new Error(`kadena: bad ${field} ${JSON.stringify(value)} in ${where}`);
  return parsed;
};

// The branch endpoints walk back from the given block, so they only return blocks of the canonical
// chain. The plain header/block listings also return orphaned blocks, which would be counted twice.
const branchOf = (tip: Tip) => ({ lower: [], upper: [tip.hash] });

// block creation time in seconds, header times are in microseconds
const getBlockTime = async (height: number, tip: Tip): Promise<number> => {
  const { items } = await httpPost(`${API}/chain/0/header/branch?minheight=${height}&maxheight=${height}`, branchOf(tip), HEADER_ACCEPT);
  if (!Array.isArray(items) || items.length !== 1) throw new Error(`kadena: no header at height ${height} on chain 0`);
  return items[0].creationTime / 1e6;
};

// lowest height on chain 0 whose block was created at or after the timestamp
const getHeightAt = async (timestamp: number, tip: Tip): Promise<number> => {
  let low = 0;
  let high = tip.height;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (await getBlockTime(mid, tip) >= timestamp) high = mid;
    else low = mid + 1;
  }
  return low;
};

// every canonical block of one chain created inside the window
const getChainBlocks = async (chainId: number, minHeight: number, wantedMaxHeight: number, tip: Tip, window: Window): Promise<KadenaBlock[]> => {
  // a range reaching past the block the branch starts from comes back empty
  const maxHeight = Math.min(wantedMaxHeight, tip.height);
  const blocks: KadenaBlock[] = [];
  let next: string | undefined = undefined;
  let pages = 0;
  let blockCount = 0;
  let lowest: { height: number, time: number } | undefined;
  let highest: { height: number, time: number } | undefined;

  do {
    if (pages >= MAX_PAGES) throw new Error(`kadena: more than ${MAX_PAGES} pages of blocks on chain ${chainId}, refusing to return a partial list`);
    let url = `${API}/chain/${chainId}/block/branch?minheight=${minHeight}&maxheight=${maxHeight}`;
    if (next) url += `&next=${encodeURIComponent(next)}`;
    const response = await httpPost(url, branchOf(tip));
    if (!Array.isArray(response.items)) throw new Error(`kadena: no blocks in response for chain ${chainId} heights ${minHeight}-${maxHeight}`);

    for (const { header, payloadWithOutputs } of response.items) {
      const time = header.creationTime / 1e6;
      blockCount++;
      if (!lowest || header.height < lowest.height) lowest = { height: header.height, time };
      if (!highest || header.height > highest.height) highest = { height: header.height, time };
      if (time < window.startTimestamp || time >= window.endTimestamp) continue;

      blocks.push({
        chainId,
        height: header.height,
        timestamp: time,
        transactions: payloadWithOutputs.transactions.map(([transaction, output]: [string, string]) => ({
          cmd: JSON.parse(decode(transaction).cmd),
          output: decode(output),
        })),
      });
    }

    next = response.next ?? undefined;
    pages++;
    if (!response.items.length) break;
  } while (next);

  if (!lowest || !highest) {
    // chains 10-19 only exist since the 2020-08-20 chain graph upgrade, nothing to return before that
    if (chainId >= 10 && tip.height > 0) {
      const { items } = await httpPost(`${API}/chain/${chainId}/header/branch?minheight=0&maxheight=${maxHeight}&limit=1`, branchOf(tip), HEADER_ACCEPT);
      if (Array.isArray(items) && !items.length) return [];
    }
    throw new Error(`kadena: no blocks on chain ${chainId} between heights ${minHeight} and ${maxHeight}`);
  }
  // one block per height from the first block returned up to maxHeight, no gaps
  if (highest.height !== maxHeight || blockCount !== highest.height - lowest.height + 1) {
    throw new Error(`kadena: got ${blockCount} blocks for heights ${lowest.height}-${maxHeight} on chain ${chainId}, refusing to return a partial list`);
  }
  // the range has to start before the window and end after it, unless it hits the chain's first block or its tip
  const startsBeforeWindow = lowest.time < window.startTimestamp || lowest.height > minHeight || minHeight === 0;
  const endsAfterWindow = highest.time >= window.endTimestamp || maxHeight === tip.height;
  if (!startsBeforeWindow || !endsAfterWindow) {
    throw new Error(`kadena: blocks ${lowest.height}-${highest.height} on chain ${chainId} do not cover the whole window, refusing to return a partial list`);
  }
  return blocks;
};

// Calls onBlock for every canonical block created in [startTimestamp, endTimestamp) on the given chains
// (all 20 by default), one chain at a time. Throws instead of handing over a partial window.
export async function forEachKadenaBlock(window: Window, onBlock: (block: KadenaBlock) => void, chainIds?: number[]): Promise<void> {
  const cut = await httpGet(`${API}/cut`);
  const tips: Tip[] = [];
  for (let chainId = 0; chainId < KADENA_CHAIN_COUNT; chainId++) {
    const tip = cut?.hashes?.[chainId];
    if (!Number.isInteger(tip?.height) || typeof tip?.hash !== 'string') throw new Error(`kadena: chain ${chainId} is missing from the current cut`);
    tips.push(tip);
  }

  const startHeight = await getHeightAt(window.startTimestamp, tips[0]);
  const endHeight = await getHeightAt(window.endTimestamp, tips[0]);
  const minHeight = Math.max(0, startHeight - HEIGHT_MARGIN);
  const maxHeight = endHeight + HEIGHT_MARGIN;

  for (const chainId of chainIds ?? tips.map((_tip, index) => index)) {
    if (!tips[chainId]) throw new Error(`kadena: unknown chain ${chainId}`);
    const blocks = await getChainBlocks(chainId, minHeight, maxHeight, tips[chainId], window);
    for (const block of blocks) onBlock(block);
  }
}
