import {
  BLOCK,
  CONTRACT,
  Context,
  addressTopic,
  eventTopic,
  getLogs,
  lowercase,
  openingMultiCall,
  recordFees,
  toBigInt,
} from './common';

const ASSET_AT =
  'function assetAt(uint256) view returns((address currency,uint256 index,uint256 carry,uint128 received,' +
  'uint128 paid,uint128 pendingStream,uint64 streamEnd,uint64 lastRelease))';
const CLAIMABLE = 'function claimable(address,uint256) view returns(uint256)';
const INCOME_CLAIMED = 'event IncomeClaimed(address indexed account,uint256 indexed asset,address indexed to,uint256 amount)';

/** Revenue tokenizer fees: the original earns as income vests, the newer one charges when a payment is delivered. */
export async function fetchTokenizerFees(ctx: Context) {
  await fetchOriginalTokenizerFees(ctx);
  await fetchCurrentTokenizerFees(ctx);
}

/** Hookr's leg collector earns: claimable at window end - claimable at window start + claims in the window. */
async function fetchOriginalTokenizerFees(ctx: Context) {
  const { api } = ctx.options;
  const minted = await getLogs(
    ctx,
    [CONTRACT.oldTokenizer],
    'event Tokenized(address indexed token,address indexed creator,uint8 way,address forwarder,address adapter,' +
      'address door,bytes32 familyId,bytes32 marketFamilyId,uint256 supply,uint64 unlockBlock,uint16 legBps)',
    { fromBlock: BLOCK.oldTokenizer, cacheInCloud: true },
  );
  const tokens = minted.filter(log => Number(log.args.legBps) !== 0).map(log => lowercase(log.args.token));
  const existing = minted
    .filter(log => Number(log.args.legBps) !== 0 && log.blockNumber < ctx.fromBlock)
    .map(log => lowercase(log.args.token));

  // A token can add assets during the window; those start with nothing claimable.
  const closingCounts = await api.multiCall({ abi: 'uint256:assetCount', calls: tokens });
  const openingCounts = await openingMultiCall(ctx, { abi: 'uint256:assetCount', calls: existing });
  const listAssets = (list: string[], counts: any[]) =>
    list.flatMap((token, i) => Array.from({ length: Number(counts[i]) }, (_, index) => ({ token, index })));
  const assets = listAssets(tokens, closingCounts);
  const openingAssets = listAssets(existing, openingCounts);
  const toCall = ({ token, index }: { token: string; index: number }) => ({
    target: token,
    params: [CONTRACT.oldLegCollector, index],
  });

  const states = await api.multiCall({
    abi: ASSET_AT,
    calls: assets.map(({ token, index }) => ({ target: token, params: [index] })),
  });
  const closing = await api.multiCall({ abi: CLAIMABLE, calls: assets.map(toCall) });
  const opening = await openingMultiCall(ctx, { abi: CLAIMABLE, calls: openingAssets.map(toCall) });
  const openingClaimable = new Map(openingAssets.map(({ token, index }, i) => [`${token}:${index}`, toBigInt(opening[i])]));

  const claimed = new Map<string, bigint>();
  for (const log of await getLogs(ctx, tokens, INCOME_CLAIMED, {
    topics: [eventTopic(INCOME_CLAIMED), addressTopic(CONTRACT.oldLegCollector)],
  })) {
    const key = `${log.address}:${Number(log.args.asset)}`;
    claimed.set(key, (claimed.get(key) ?? 0n) + toBigInt(log.args.amount));
  }

  assets.forEach(({ token, index }, i) => {
    const key = `${token}:${index}`;
    const gross = toBigInt(closing[i]) - (openingClaimable.get(key) ?? 0n) + (claimed.get(key) ?? 0n);
    // What The Hook is owed one point of the 5% collector leg, i.e. 20% of it.
    // https://github.com/Hookr-fun/hookr-contracts/blob/main/hookr-1/revenue-tokenizer/README.md#fees
    recordFees(ctx, 'tokenizer', states[i].currency, gross, gross - gross / 5n);
  });
}

/** LegPaid is the delivery fee on each payment; the forwarding door's event describes the same payment. */
async function fetchCurrentTokenizerFees(ctx: Context) {
  const minted = await getLogs(
    ctx,
    [CONTRACT.newTokenizer],
    'event Tokenized(address indexed token,address indexed creator,uint256 supply,address streamManager,bool openStreams)',
    { fromBlock: BLOCK.newTokenizer, cacheInCloud: true },
  );
  const payments = await getLogs(
    ctx,
    minted.map(log => lowercase(log.args.token)),
    'event LegPaid(uint256 indexed door,uint256 indexed asset,uint256 amount)',
  );
  const assetKey = (log: { address: string; args: Record<string, any> }) => `${log.address}:${log.args.asset}`;
  const paidAssets = [...new Map(payments.map(log => [assetKey(log), log])).values()];
  const states = await ctx.options.api.multiCall({
    abi: ASSET_AT,
    calls: paidAssets.map(log => ({ target: log.address, params: [log.args.asset] })),
  });
  const currencies = new Map(paidAssets.map((log, i) => [assetKey(log), lowercase(states[i].currency)]));

  for (const log of payments) {
    const amount = toBigInt(log.args.amount);
    recordFees(ctx, 'tokenizer', currencies.get(assetKey(log))!, amount, amount);
  }
}
