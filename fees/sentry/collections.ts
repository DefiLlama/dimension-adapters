import { FetchOptions } from '../../adapters/types';
import { Interface } from 'ethers';
import { getTxReceiptsWithRetry } from '../../helpers/getTxReceipts';

const abi = {
  v3: 'event FeesCollected(uint256 indexed tokenId,uint256 amount0,uint256 amount1)',
  v4: 'event FeesCollected(address indexed token,uint256 amount0,uint256 amount1)',
  vault3: 'event V3FeesCollected(uint256 indexed tokenId,uint256 amount0,uint256 amount1)',
  vault4: 'event V4FeesCollected(address indexed token,uint256 amount0,uint256 amount1)',
  creator3: 'event CreatorFeePaid(uint256 indexed tokenId,address indexed recipient,address currency,uint256 amount)',
  creator4: 'event CreatorFeePaid(address indexed token,address indexed recipient,address currency,uint256 amount)',
  creatorInk: 'event CreatorFeePaid(uint256 indexed tokenId,address indexed recipient,uint256 amount)',
  creatorToken: 'event CreatorTokenFeePaid(uint256 indexed tokenId,address indexed recipient,address currency,uint256 amount)',
  vaultCreator3: 'event V3CreatorFeePaid(uint256 indexed tokenId,address indexed recipient,address currency,uint256 amount)',
  vaultCreator4: 'event V4CreatorFeePaid(address indexed token,address indexed recipient,address currency,uint256 amount)',
  npm: 'event Collect(uint256 indexed tokenId,address recipient,uint256 amount0,uint256 amount1)',
  pool: 'event Collect(address indexed owner,address recipient,int24 indexed tickLower,int24 indexed tickUpper,uint128 amount0,uint128 amount1)',
  transfer: 'event Transfer(address indexed from,address indexed to,uint256 value)',
};
const interfaces = Object.fromEntries(Object.entries(abi).map(([key, event]) => [key, new Interface([event])]));
const topics = Object.fromEntries(Object.entries(interfaces).map(([key, iface]) => [key, iface.fragments.map(f => iface.getEvent(f.format())!.topicHash)[0]]));
const lower = (s: string) => s.toLowerCase();
const parse = (key: string, log: any) => interfaces[key].parseLog(log)!.args;

// LP fee collection is recognized on receipt. Do not infer accrual from swap
// notional or use today's creator split for historical positions. The factory's
// FeesCollected event excludes principal even in the v3 migration transaction.
export async function collections(options: FetchOptions, factories: { address: string; block: number; version: number }[], vault: string, baseOf: (token: string) => string) {
  const toBlock = await options.getToBlock(), fromBlock = (await options.getFromBlock()) + 1;
  const owners = new Set([...factories.filter(f => f.block <= toBlock).map(f => lower(f.address)), lower(vault)]);
  const logs = await options.getLogs({ targets: [...owners], topics: [[topics.v3, topics.v4, topics.vault3, topics.vault4]], fromBlock, toBlock, maxBlockRange: options.chain === 'ink' ? 9900 : undefined, entireLog: true });
  const hashes: string[] = [...new Set<string>(logs.map(l => l.transactionHash))];
  const result: { asset: string; gross: bigint; creator: bigint; tx: string }[] = [];
  const poolTokens = new Map<string, string[]>();
  const grossKeys = ['v3', 'v4', 'vault3', 'vault4'], creatorKeys = ['creator3', 'creator4', 'creatorInk', 'creatorToken', 'vaultCreator3', 'vaultCreator4'];
  for (let start = 0; start < hashes.length; start += 5) {
    const receipts = await getTxReceiptsWithRetry(options.chain, hashes.slice(start, start + 5));
    for (const receipt of receipts) {
      if (!receipt) throw new Error('Missing Sentry fee collection receipt');
      const byAsset = new Map<string, { gross: bigint; creator: bigint }>();
      const add = (asset: string, kind: 'gross' | 'creator', amount: bigint) => {
        const key = lower(asset), row = byAsset.get(key) ?? { gross: 0n, creator: 0n };
        row[kind] += amount; byAsset.set(key, row);
      };
      for (let i = 0; i < receipt.logs.length; i++) {
        const log = receipt.logs[i];
        if (!owners.has(lower(log.address))) continue;
        const key = grossKeys.find(k => log.topics[0] === topics[k]);
        if (key) {
          const a = parse(key, log);
          if (!a.amount0 && !a.amount1) continue;
          let currencies: string[];
          if (key === 'v4' || key === 'vault4') currencies = [lower(a.token), baseOf(a.token)].sort();
          else {
            // Derive the NFT's currencies from THIS collection receipt. NFT ids
            // overlap across migrated position managers, and burned NFTs cannot
            // be looked up at the end of a historical window.
            const before = receipt.logs.slice(0, i).reverse();
            const npm = before.find(l => {
              if (l.topics[0] !== topics.npm) return false;
              const c = parse('npm', l);
              return c.tokenId === a.tokenId && lower(c.recipient) === lower(log.address) && c.amount0 === a.amount0 && c.amount1 === a.amount1;
            });
            if (!npm) throw new Error(`Missing NFT collection in ${receipt.hash}`);
            const pool = before.find(l => {
              if (l.index >= npm.index || l.topics[0] !== topics.pool) return false;
              const c = parse('pool', l);
              return lower(c.owner) === lower(npm.address) && lower(c.recipient) === lower(log.address) && c.amount0 === a.amount0 && c.amount1 === a.amount1;
            });
            if (!pool) throw new Error(`Missing pool collection in ${receipt.hash}`);
            if (!poolTokens.has(pool.address)) poolTokens.set(pool.address, await options.api.multiCall({ abi: 'address:token0', calls: [pool.address] }).then(async r => [r[0], await options.api.call({ target: pool.address, abi: 'address:token1' })]));
            currencies = poolTokens.get(pool.address)!;
          }
          add(currencies[0], 'gross', BigInt(a.amount0));
          add(currencies[1], 'gross', BigInt(a.amount1));
        }
        const creatorKey = creatorKeys.find(k => log.topics[0] === topics[k]);
        if (creatorKey) {
          const a = parse(creatorKey, log);
          let asset = a.currency;
          if (!asset) {
            // Older Ink events call this wethAmount even for another base.
            // The transfer immediately preceding the payout supplies its asset.
            const transfer = receipt.logs.slice(0, i).reverse().find(l => {
              if (l.topics[0] !== topics.transfer) return false;
              const t = parse('transfer', l);
              return lower(t.from) === lower(log.address) && lower(t.to) === lower(a.recipient) && t.value === a.amount;
            });
            if (!transfer) throw new Error(`Missing creator payment currency in ${receipt.hash}`);
            asset = transfer.address;
          }
          add(asset, 'creator', BigInt(a.amount));
        }
      }
      for (const [asset, amounts] of byAsset) {
        if (amounts.creator > amounts.gross) throw new Error(`Creator payout exceeds collected fees in ${receipt.hash}`);
        result.push({ asset, ...amounts, tx: receipt.hash });
      }
    }
  }
  return result;
}
