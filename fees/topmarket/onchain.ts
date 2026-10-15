import { ChainApi, getProvider } from '@defillama/sdk';
import { Interface, keccak256 } from 'ethers';
import { FetchOptions } from '../../adapters/types';
import { Context, events, Log, lower, order, requestKey, winKey, Win } from './accounting';
import { BEACON, BEACON_BLOCK, BOX_FACTORY, BOX_FACTORY_BLOCK, INDEXED_ID_BATCH_SIZE, MARKET, MARKET_BLOCK, MAX_LOG_BLOCK_RANGE, NFT_FACTORY, NFT_FACTORY_BLOCK, TOKEN_BEACON, TOKEN_BEACON_BLOCK, TOKEN_BOX_FACTORY, TOKEN_FACTORY_VERSION, TOKEN_POOL, TOKEN_POOL_BLOCK, ZERO } from './config';

const winAbi = 'function wins(uint256) view returns(address winner,address collection,uint256 tokenId,uint256 price,address staker,uint64 deadline,bool settled,bool paramsSnapshotted,uint16 snapBuybackDiscountBps,uint16 snapProfitShareBps)';
// Filled only from BaseScan-verified TopMarketNFT runtime bytecode. NFT contracts are
// non-upgradeable; factory membership alone does not prove absence of royalties.
export const nftCodeHashes = new Set([
  // https://basescan.org/address/0x93dc1c974bdfdacee23d98e29157c9640cadc17b#code
  '0xec321b9ba5f68e8f30f077a9009fdd9b79016dfefb783a570920ce66766fb53c',
  // https://basescan.org/address/0x65f9c0b72391a40d42b19420f86fa7c48aa46a5e#code
  '0xa46db4e91ef868ab3ca830bcc87936e60e4a40ff8562adf2e5b861281d54592b',
]);

type OriginName = 'Won' | 'DrawRequested' | 'AuctionCreated';
/** Batch only missing origins by emitter/source namespace, avoiding repeated full-history monetary scans. */
export function missingOriginBatches(name: OriginName, idField: string, references: Log[], logs: Log[]) {
  // Include the source active at DrawRequested / Won / refund time. The complete
  // slow configuration history is already loaded; ID equality alone is unsafe.
  const changes = logs.filter(l => l.name === 'RandomnessSourceSet').sort(order);
  const key = (l: Log) => {
    if (name !== 'DrawRequested') return winKey(l.address, l.args[idField]);
    let source = ZERO;
    for (const change of changes)
      if (lower(change.address) === lower(l.address) && order(change, l) < 0) source = lower(change.args.current);
    return requestKey(l.address, source, l.args[idField]);
  };
  const known = new Set(logs.filter(l => l.name === name).map(key));
  const missing = new Map<string, Set<string>>();
  for (const l of references) {
    const target = lower(l.address), id = String(l.args[idField]);
    if (known.has(key(l))) continue;
    if (!missing.has(target)) missing.set(target, new Set());
    missing.get(target)!.add(id);
  }
  const batches: { target: string; ids: string[] }[] = [];
  for (const [target, values] of missing) {
    const ids = [...values];
    for (let i = 0; i < ids.length; i += INDEXED_ID_BATCH_SIZE)
      batches.push({ target, ids: ids.slice(i, i + INDEXED_ID_BATCH_SIZE) });
  }
  return batches;
}

/** Load bounded activity and its historical configuration, origins and staker evidence; missing evidence fails closed. */
export async function loadContext(options: FetchOptions, referralSources: { address: string; blockNumber: number }[] = []): Promise<Context> {
  const toBlock = await options.getToBlock(), fromBlock = await options.getFromBlock();
  if (!Number.isSafeInteger(fromBlock) || !Number.isSafeInteger(toBlock)) throw new Error('TopMarket: missing block bounds');
  const provider = getProvider(options.chain);
  if (!provider) throw new Error('TopMarket: RPC unavailable');
  const logs: Log[] = [];
  const api = new ChainApi({ chain: options.chain, block: toBlock });
  /** Decode one readable event ABI while preserving emitter, transaction and execution position. */
  async function get(name: keyof typeof events, targets: string[], startBlock: number, cacheInCloud = false, ids?: string[], indexed?: any[]) {
    if (!targets.length || startBlock > toBlock) return [];
    const iface = new Interface([events[name]]);
    const fragment = iface.getEvent(events[name].match(/event (\w+)/)![1])!;
    // getLogs accepts JSON-RPC OR topics at runtime; its public topics type is narrower.
    const topics = indexed || ids ? iface.encodeFilterTopics(fragment, indexed ?? [ids]) as string[] : undefined;
    // Base RPCs can cap queries at 100,000 blocks; leave room for SDK padding.
    const raw = await options.getLogs({ targets, eventAbi: events[name], fromBlock: startBlock,
      toBlock, maxBlockRange: MAX_LOG_BLOCK_RANGE, onlyArgs: false, entireLog: true, parseLog: true, cacheInCloud, ...(topics ? { topics } : {}) });
    return raw.filter((l: any) => Number(l.blockNumber) >= startBlock && Number(l.blockNumber) <= toBlock).map((l: any): Log => {
      const blockNumber = Number(l.blockNumber), logIndex = Number(l.logIndex ?? l.index);
      if (!l.args || !l.address || !targets.includes(lower(l.address)) || !l.transactionHash || l.removed || !Number.isSafeInteger(blockNumber) || !Number.isSafeInteger(logIndex))
        throw new Error(`TopMarket: incomplete/removed ${name} log`);
      const args: Record<string, any> = {};
      // The SDK returns ethers Results; get named arguments without losing bigint values.
      fragment.inputs.forEach((input, i) => {
        const value = l.args[i] ?? l.args[input.name];
        if (value === undefined || value === null) throw new Error(`TopMarket: missing ${name}.${input.name}`);
        args[input.name] = String(value);
      });
      const canonicalName = ({ TokenDrawRequested: 'DrawRequested', TokenWon: 'Won', TokenWinRecycled: 'WinRecycled' } as Record<string, string>)[name] ?? name;
      return { name: canonicalName, address: lower(l.address), blockNumber, logIndex, transactionHash: lower(l.transactionHash), args };
    });
  }

  /** Query each readable event ABI sequentially, preserving strict metadata checks and execution order. */
  async function scanEvents(names: (keyof typeof events)[], target: string, startBlock: number, cacheInCloud = false) {
    if (startBlock > toBlock) return [];
    const configuration = new Set(['Upgraded', 'FeeBpsUpdated', 'FeeRecipientUpdated', 'BoxFeeRecipientUpdated', 'TreasuryUpdated', 'JackpotSet', 'RandomnessSourceSet']);
    if (cacheInCloud && names.some(n => !configuration.has(n))) throw new Error('TopMarket: cannot cloud-cache monetary event scan');
    // Use the SDK's readable eventAbi decoder; await each query to avoid a burst
    // of parallel requests. Only slow configuration histories may use cloud cache.
    const result: Log[] = [];
    for (const name of names) result.push(...await get(name, [target], startBlock, cacheInCloud));
    return result.sort(order);
  }

  const standardCreations = await get('BoxCreated', [BOX_FACTORY], BOX_FACTORY_BLOCK, true);
  // The nonstandard factory is deployed after its beacon; begin at the beacon
  // deployment so future factory-issued boxes are discovered automatically.
  const tokenCreations = await get('BoxCreated', [TOKEN_BOX_FACTORY], TOKEN_BEACON_BLOCK, true);
  const tokenTargets = tokenCreations.map(l => lower(l.args.box));
  const standardTargets = standardCreations.map(l => lower(l.args.box));
  const creations = [...standardCreations, ...tokenCreations];
  const createdAt = new Map(creations.map(l => [lower(l.args.box), l.blockNumber]));
  const referralBoxes = new Set<string>();
  for (const source of referralSources) {
    const address = lower(source.address), deployed = createdAt.get(address);
    if (deployed === undefined || !Number.isSafeInteger(source.blockNumber) ||
        source.blockNumber < deployed || source.blockNumber > toBlock)
      throw new Error('TopMarket: referral source outside included deployment scope');
    referralBoxes.add(address);
  }
  /** Fetch only historical IDs referenced by the window, using each deployment's event layout. */
  async function loadOrigins(name: OriginName, idField: string, references: Log[]) {
    for (const { target, ids } of missingOriginBatches(name, idField, references, logs)) {
      const start = target === MARKET ? MARKET_BLOCK : createdAt.get(target);
      if (start === undefined) throw new Error(`TopMarket: unknown origin emitter ${target}`);
      const nonstandard = tokenTargets.includes(target);
      const event = nonstandard && name !== 'AuctionCreated' ? (name === 'Won' ? 'TokenWon' : 'TokenDrawRequested') : name;
      logs.push(...await get(event, [target], start, false, ids));
      if (name === 'DrawRequested' && !nonstandard) logs.push(...await get('DrawRequestedVia', [target], start, false, ids));
    }
  }
  // Discover the window's activity first. Only those emitters need historical
  // configuration/state; a settlement-only window still includes its box here.
  for (const creation of creations) {
    const target = lower(creation.args.box), nonstandard = tokenTargets.includes(target);
    const names: (keyof typeof events)[] = nonstandard ? ['TokenDrawRequested', 'TokenWon', 'TokenWinRecycled'] : ['DrawRequested', 'DrawRequestedVia', 'Won', 'WinRecycled'];
    logs.push(...await scanEvents([...names, 'DrawRefunded', 'RequestRescued', 'WinKept', 'VoucherRedeemed'], target, Math.max(creation.blockNumber, fromBlock)));
  }
  logs.push(...await scanEvents(['Sold', 'OfferAccepted', 'AuctionSettled'], MARKET, Math.max(MARKET_BLOCK, fromBlock)));
  // A referral may settle in an otherwise empty later hour. Load its verified
  // source box configuration without re-counting the earlier purchase.
  const activeEmitters = new Set([...logs.map(l => lower(l.address)), ...referralBoxes]);
  if (activeEmitters.has(MARKET))
    logs.push(...await scanEvents(['Upgraded', 'FeeBpsUpdated', 'FeeRecipientUpdated'], MARKET, MARKET_BLOCK, true));
  if (standardTargets.some(a => activeEmitters.has(a))) logs.push(...await get('Upgraded', [BEACON], BEACON_BLOCK, true));
  if (tokenTargets.some(a => activeEmitters.has(a))) {
    logs.push(...await get('Upgraded', [TOKEN_BEACON], TOKEN_BEACON_BLOCK, true));
    logs.push(...await get('Upgraded', [TOKEN_POOL], TOKEN_POOL_BLOCK, true));
  }
  for (const creation of creations.filter(l => activeEmitters.has(lower(l.args.box))))
    logs.push(...await scanEvents(['BoxFeeRecipientUpdated', 'TreasuryUpdated', 'JackpotSet', 'RandomnessSourceSet'],
      lower(creation.args.box), creation.blockNumber, true));
  const payouts = logs.filter(l => ['WinKept', 'WinRecycled'].includes(l.name));
  await loadOrigins('Won', 'winId', payouts);
  const payoutKeys = new Set(payouts.map(l => winKey(l.address, l.args.winId)));
  await loadOrigins('DrawRequested', 'requestId', logs.filter(l =>
    ['DrawRefunded', 'RequestRescued'].includes(l.name) || (l.name === 'Won' && payoutKeys.has(winKey(l.address, l.args.winId)))));
  await loadOrigins('AuctionCreated', 'auctionId', logs.filter(l => l.name === 'AuctionSettled' && BigInt(l.args.amount) > 0n));

  let initialFeeBps = '0', initialRecipient = '';
  if (activeEmitters.has(MARKET)) {
    const initialApi = new ChainApi({ chain: options.chain, block: MARKET_BLOCK });
    initialFeeBps = String(await initialApi.call({ target: MARKET, abi: 'uint16:feeBps' }));
    initialRecipient = await initialApi.call({ target: MARKET, abi: 'address:feeRecipient' });
    if (logs.some(l => l.address === MARKET && l.blockNumber === MARKET_BLOCK && ['FeeBpsUpdated', 'FeeRecipientUpdated', 'Sold', 'OfferAccepted', 'AuctionCreated'].includes(l.name)))
      throw new Error('TopMarket: deployment-block configuration needs transaction-level initialization evidence');
  }
  const boxes: Context['boxes'] = {};
  // No historical state reads are needed for boxes with no linked monetary
  // activity in this window. Factory discovery still checks every deployed box.
  const activeBoxes = new Set(logs.filter(l => ['DrawRequested', 'DrawRequestedVia', 'Won', 'DrawRefunded', 'RequestRescued', 'WinKept', 'WinRecycled', 'VoucherRedeemed'].includes(l.name)).map(l => lower(l.address)));
  referralBoxes.forEach(address => activeBoxes.add(address));
  const activeCreations = creations.filter(l => activeBoxes.has(lower(l.args.box)));
  if (activeCreations.some(l => tokenTargets.includes(lower(l.args.box)))) {
    const upgrades = (await get('Upgraded', [TOKEN_BOX_FACTORY], TOKEN_BEACON_BLOCK, true)).sort(order);
    for (const creation of tokenCreations.filter(l => activeBoxes.has(lower(l.args.box)))) {
      const history = upgrades.filter(l => order(l, creation) < 0);
      if (!history.length || history.some(l => lower(l.args.implementation) !== TOKEN_FACTORY_VERSION))
        throw new Error('TopMarket: unverified nonstandard factory creation history');
    }
  }
  for (const block of new Set(activeCreations.map(l => l.blockNumber))) {
    const addresses = activeCreations.filter(l => l.blockNumber === block).map(l => lower(l.args.box));
    const initialApi = new ChainApi({ chain: options.chain, block });
    const tokens = await initialApi.multiCall({ abi: 'address:settlementToken', calls: addresses });
    const recipients = await initialApi.multiCall({ abi: 'address:feeRecipient', calls: addresses });
    const treasuries = await initialApi.multiCall({ abi: 'address:treasury', calls: addresses });
    const jackpots = await initialApi.multiCall({ abi: 'address:jackpot', calls: addresses });
    addresses.forEach((address, i) => { boxes[address] = { token: lower(tokens[i]), treasury: lower(treasuries[i]), feeRecipient: lower(recipients[i]), jackpot: lower(jackpots[i]) }; });
    const nonstandard = addresses.filter(a => tokenTargets.includes(a));
    if (nonstandard.length) {
      // All boxes created at this block share one historical factory read. Do
      // not deduplicate across blocks: later configuration may differ.
      const [beacon] = await initialApi.multiCall({ abi: 'address:beacon', calls: [TOKEN_BOX_FACTORY] });
      if (lower(beacon) !== TOKEN_BEACON) throw new Error('TopMarket: unexpected nonstandard factory beacon');
      const pools = await initialApi.multiCall({ abi: 'address:stakingPool', calls: nonstandard });
      nonstandard.forEach((address, i) => {
        if (lower(pools[i]) !== TOKEN_POOL) throw new Error(`TopMarket: unverified nonstandard staking pool ${pools[i]}`);
        boxes[address].kind = 'nonstandard'; boxes[address].stakingPool = TOKEN_POOL;
      });
    }
  }
  const standardPayouts = payouts.filter(l => !tokenTargets.includes(l.address));
  const calls = standardPayouts.map(l => ({ target: l.address, params: String(l.args.winId) }));
  const winValues = calls.length ? await api.multiCall({ abi: winAbi, calls }) : [];
  const wins: Record<string, Win> = {};
  standardPayouts.forEach((l, i) => {
    const w = winValues[i];
    if (w.length !== 10) throw new Error(`TopMarket: wins() requires ten outputs at ${l.address}`);
    wins[winKey(l.address, l.args.winId)] = { winner: w[0], collection: w[1], tokenId: String(w[2]), price: String(w[3]), staker: w[4] };
  });
  const tokenWins = logs.filter(l => l.name === 'Won' && tokenTargets.includes(l.address) && payoutKeys.has(winKey(l.address, l.args.winId)));
  if (tokenWins.length) {
    // Include all pool settlements in the window to prevent a receipt join from
    // skipping an intervening settlement for a different card in a batch.
    for (const name of ['CardSettledKeep', 'CardSettledReturn'] as const)
      logs.push(...await get(name, [TOKEN_POOL], Math.max(TOKEN_POOL_BLOCK, fromBlock)));
    const cardIds = new Map<string, Set<string>>();
    for (const l of tokenWins) {
      const collection = lower(l.args.collection);
      if (!cardIds.has(collection)) cardIds.set(collection, new Set());
      cardIds.get(collection)!.add(String(l.args.tokenId));
    }
    for (const [collection, values] of cardIds) {
      const ids = [...values];
      for (let i = 0; i < ids.length; i += INDEXED_ID_BATCH_SIZE)
        for (const name of ['TokenStaked', 'TokenUnstaked', 'CardLocked', 'LockRescued', 'CardSettledKeep', 'CardSettledReturn'] as const)
          logs.push(...await get(name, [TOKEN_POOL], TOKEN_POOL_BLOCK, false, undefined, [collection, ids.slice(i, i + INDEXED_ID_BATCH_SIZE)]));
    }
  }
  const tradedNfts = new Set<string>([
    ...Object.values(wins).map(w => lower(w.collection)),
    ...tokenWins.map(l => lower(l.args.collection)),
    ...logs.filter(l => ['Sold', 'OfferAccepted', 'AuctionCreated'].includes(l.name)).map(l => lower(l.args.nft)),
  ]);
  const collections = new Set<string>();
  if (tradedNfts.size) {
    const registered = new Set((await get('CollectionCreated', [NFT_FACTORY], NFT_FACTORY_BLOCK, true)).map(l => lower(l.args.nft)));
    for (const nft of tradedNfts) {
      if (!registered.has(nft)) throw new Error(`TopMarket: NFT not issued by platform factory ${nft}`);
      const code = await provider.getCode(nft, toBlock);
      if (!nftCodeHashes.has(keccak256(code))) throw new Error(`TopMarket: unverified NFT bytecode/royalty semantics ${nft}`);
      collections.add(nft);
    }
  }
  // Block lookups filter the exact supplied [start,end), including inclusive RPC bounds.
  // Old origins remain context only; no current owner/status or future outcome filters.
  const timestamps = new Map<number, number>();
  for (const block of new Set(logs.filter(l => l.blockNumber >= fromBlock).map(l => l.blockNumber))) {
    const result = await provider.getBlock(block);
    if (!result) throw new Error(`TopMarket: block not found ${block}`);
    timestamps.set(block, result.timestamp);
  }
  logs.forEach(l => { l.timestamp = timestamps.get(l.blockNumber); });
  return { logs, boxes, wins, collections, marketInitialFeeBps: initialFeeBps, marketInitialRecipient: initialRecipient };
}
