import { BEACON, BOX_VERSIONS, EXCLUDED_JACKPOT, Inputs, MARKET, MARKET_VERSIONS, PROTOCOL_STAKERS, REFERRAL_COVERAGE_END, TOKEN_BEACON, TOKEN_BOX_VERSIONS, TOKEN_POOL, TOKEN_POOL_VERSION, TREASURY, USDC, ZERO } from './config';

// Human-readable ABIs from verified Marketplace.sol and BlindBox.sol, not the stale
// integration wins() ABI. Amounts always remain integer token base units.
export const events = {
  DrawRequested: 'event DrawRequested(uint256 indexed requestId,address indexed player,uint256 paid,uint256 fee)',
  DrawRequestedVia: 'event DrawRequestedVia(uint256 indexed requestId,address indexed source)',
  RandomnessSourceSet: 'event RandomnessSourceSet(address indexed previous,address indexed current)',
  DrawRefunded: 'event DrawRefunded(uint256 indexed requestId,address indexed player,uint256 amount,uint8 reason)',
  RequestRescued: 'event RequestRescued(uint256 indexed requestId,address indexed player,uint256 amount)',
  Won: 'event Won(uint256 indexed winId,uint256 indexed requestId,address indexed winner,address collection,uint256 tokenId,uint256 price)',
  WinKept: 'event WinKept(uint256 indexed winId,address indexed winner,uint256 stakerPayout)',
  WinRecycled: 'event WinRecycled(uint256 indexed winId,address indexed winner,uint256 recyclePrice,address staker,uint256 stakerShare)',
  FeeBpsUpdated: 'event FeeBpsUpdated(uint16 feeBps)',
  FeeRecipientUpdated: 'event FeeRecipientUpdated(address feeRecipient)',
  BoxFeeRecipientUpdated: 'event FeeRecipientUpdated(address indexed newRecipient)',
  TreasuryUpdated: 'event TreasuryUpdated(address indexed newTreasury)',
  JackpotSet: 'event JackpotSet(address indexed jackpot)',
  VoucherRedeemed: 'event VoucherRedeemed(address indexed player,uint256 indexed nonce,uint256 payAmount,uint256 drawPrice)',
  Sold: 'event Sold(address indexed nft,uint256 indexed tokenId,address seller,address indexed buyer,address currency,uint256 price)',
  OfferAccepted: 'event OfferAccepted(address indexed nft,uint256 indexed tokenId,address seller,address indexed buyer,address currency,uint256 amount)',
  AuctionCreated: 'event AuctionCreated(uint256 indexed auctionId,address indexed nft,uint256 indexed tokenId,address seller,address currency,uint256 reservePrice,uint64 endTime)',
  AuctionSettled: 'event AuctionSettled(uint256 indexed auctionId,address indexed winner,uint256 amount)',
  Upgraded: 'event Upgraded(address indexed implementation)',
  BoxCreated: 'event BoxCreated(address indexed box,address indexed boxOwner)',
  CollectionCreated: 'event CollectionCreated(address indexed nft,string name,string symbol,address indexed collectionOwner)',
  TokenDrawRequested: 'event DrawRequested(uint256 indexed requestId,address indexed source,address indexed player,uint256 paid,uint256 fee)',
  TokenWon: 'event Won(uint256 indexed winId,uint256 indexed requestId,address indexed winner,address collection,uint32 tokenId,uint256 price)',
  TokenWinRecycled: 'event WinRecycled(uint256 indexed winId,address indexed winner,uint256 recyclePrice,uint256 stakerShare)',
  TokenStaked: 'event Staked(address indexed collection,uint32 indexed tokenId,address indexed staker)',
  TokenUnstaked: 'event Unstaked(address indexed collection,uint32 indexed tokenId,address indexed staker)',
  CardLocked: 'event CardLocked(address indexed collection,uint32 indexed tokenId,address indexed holder)',
  CardSettledKeep: 'event CardSettledKeep(address indexed collection,uint32 indexed tokenId,address indexed to,uint256 amount)',
  CardSettledReturn: 'event CardSettledReturn(address indexed collection,uint32 indexed tokenId,uint256 stakerShare)',
  LockRescued: 'event LockRescued(address indexed collection,uint32 indexed tokenId,address indexed by)',
} as const;

export interface Log {
  name: string;
  address: string;
  blockNumber: number;
  logIndex: number;
  transactionHash: string;
  timestamp?: number;
  args: Record<string, any>;
}
export interface Win {
  winner: string;
  collection: string;
  tokenId: string;
  price: string;
  staker: string;
}
export interface Context {
  logs: Log[];
  marketInitialFeeBps: string;
  marketInitialRecipient: string;
  boxes: Record<string, { token: string; treasury: string; feeRecipient: string; jackpot: string; kind?: 'nonstandard'; stakingPool?: string }>;
  wins: Record<string, Win>;
  collections: Set<string>; // factory-issued AND bytecode-verified non-ERC2981 NFTs
}
export interface Entry {
  event: Log;
  token: string;
  label: string;
  volume: bigint;
  fees: bigint;
  supply: bigint;
  // Diagnostic entitlement, not an additional fee or cash-flow entry.
  supplierPayout?: { staker: string; amount: bigint; classification: 'protocol' | 'supplier' };
}
export const lower = (s: string) => s.toLowerCase();
export const eventId = (l: Log) => `base:${lower(l.address)}:${lower(l.transactionHash)}:${l.logIndex}`;
export const winKey = (box: string, id: any) => `${lower(box)}:${id}`;
export const requestKey = (box: string, source: string, id: any) => `${lower(box)}:${lower(source)}:${id}`;
export const order = (a: Log, b: Log) => a.blockNumber - b.blockNumber || a.logIndex - b.logIndex;
const uint = (value: any): bigint => {
  const s = String(value);
  if (!/^\d+$/.test(s)) throw new Error(`TopMarket: invalid unsigned integer ${s}`);
  return BigInt(s);
};
const requireValue = <T>(v: T | undefined, message: string): T => {
  if (v === undefined) throw new Error(`TopMarket: ${message}`);
  return v;
};

// A false snapshot flag uses the live rate, including when the stored snapshot is zero.
// Verified current/initial deployments set it true; the legacy branch is source-tested.
export const auctionFeeBps = (snapshot: bigint | undefined, live: bigint) => snapshot ?? live;

export function assertReferralCoverage(end: number) {
  if (end > REFERRAL_COVERAGE_END)
    throw new Error('TopMarket: live referral accrual/reversal coverage missing from 2026-10-10T09:06:15Z; revenue must not assume zero referral payouts');
}

export function reconstruct(context: Context, policy: Inputs, start: number, end: number, referrals?: Entry[]) {
  if (referrals === undefined) assertReferralCoverage(end);
  const result = reconstructOnchain(context, policy, start, end);
  if (referrals !== undefined) {
    result.unresolved = result.unresolved.filter(x => x !== 'Referral accrual/reversal public coverage missing');
    result.entries.push(...referrals);
  }
  return result;
}

// Diagnostic only: return verifiable chain amounts while explicitly retaining the
// missing-referral blocker. balances() rejects unresolved results, so this cannot
// turn a partial chain audit into a public Revenue metric.
export function reconstructOnchain(context: Context, policy: Inputs, start: number, end: number) {
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start >= end)
    throw new Error('TopMarket: invalid [startTimestamp,endTimestamp)');
  const seen = new Map<string, Log>();
  for (const log of context.logs) {
    const id = eventId(log), previous = seen.get(id);
    if (previous && JSON.stringify(previous) !== JSON.stringify(log))
      throw new Error(`TopMarket: conflicting duplicate ${id}`);
    seen.set(id, log);
  }
  const logs = [...seen.values()].sort(order);
  const entries: Entry[] = [], unresolved: string[] = end > REFERRAL_COVERAGE_END ? ['Referral accrual/reversal public coverage missing'] : [];
  const requests = new Map<string, Log>(), wins = new Map<string, Log>();
  const winRequests = new Map<string, string>(), sources = new Map<string, string>();
  const markers = new Map<string, Log>();
  const markerKey = (l: Log) => `${lower(l.address)}:${lower(l.transactionHash)}:${l.args.requestId}`;
  const resolvedRequests = new Set<string>(), settledWins = new Set<string>();
  const auctions = new Map<string, { origin: Log; snapshot?: bigint }>();
  let marketVersion: string | undefined, boxVersion: string | undefined, tokenBoxVersion: string | undefined;
  let rate = uint(context.marketInitialFeeBps), recipient = lower(context.marketInitialRecipient);
  const boxes = Object.fromEntries(Object.entries(context.boxes).map(([address, box]) => [address, { ...box }]));
  const excluded = (l: Log) => !!policy.excludedTransactions[lower(l.transactionHash)] ||
    (!!policy.statisticsStart && l.blockNumber < policy.statisticsStart.block);
  const inWindow = (l: Log) => l.timestamp !== undefined && l.timestamp >= start && l.timestamp < end;
  const add = (l: Log, token: string, label: string, volume: bigint, fees: bigint, supply = 0n, supplierPayout?: Entry['supplierPayout']) => {
    // New/fee-on-transfer currencies need payment semantics verified before counting
    // nominal event amounts. Phase 1 uses Base USDC; native marketplace ETH is exact.
    if (![USDC, ZERO].includes(lower(token))) throw new Error(`TopMarket: unverified payment token ${token}`);
    if (inWindow(l)) entries.push({ event: l, token: lower(token), label, volume, fees, supply, ...(supplierPayout ? { supplierPayout } : {}) });
  };
  const collection = (nft: string) => {
    if (!context.collections.has(lower(nft))) throw new Error(`TopMarket: unverified phase-1 NFT ${nft}`);
  };
  const supplier = (l: Log, win: Win, amount: bigint, label: string) => {
    if (typeof win.staker !== 'string' || !/^0x[0-9a-f]{40}$/i.test(win.staker) || lower(win.staker) === ZERO)
      throw new Error(`TopMarket: invalid historical staker ${eventId(l)}`);
    const staker = lower(win.staker), protocol = PROTOCOL_STAKERS.has(staker);
    // wins() preserves selection-time staker; the nonstandard path rebuilds the
    // matching stake/lock round. Neither the transaction sender nor current owner
    // may override it. Internal allocations are not added as new protocol fees.
    add(l, boxes[lower(l.address)].token, label, 0n, 0n, protocol ? 0n : amount,
      { staker, amount, classification: protocol ? 'protocol' : 'supplier' });
  };
  const marketChanges = new Set(logs.filter(l => lower(l.address) === MARKET &&
    ['FeeBpsUpdated', 'FeeRecipientUpdated', 'Upgraded'].includes(l.name)).map(l => lower(l.transactionHash)));
  // The source setter requires zero pending draws. Thus an async terminal event
  // uses the source active at that event; a later Keep uses the source at Won.
  // A callback may change source after pending reaches zero, so same-tx changes
  // are ambiguous without a trace and must not be reconstructed from log order.
  const sourceChanges = new Set(logs.filter(l => l.name === 'RandomnessSourceSet')
    .map(l => `${lower(l.address)}:${lower(l.transactionHash)}`));
  const usedPoolSettlements = new Set<string>();
  function tokenWin(l: Log, origin: Log): Win {
    const pool = boxes[lower(l.address)].stakingPool;
    if (pool !== TOKEN_POOL) throw new Error(`TopMarket: unverified TokenStakingPool ${pool}`);
    const sameCard = (p: Log) => lower(p.address) === pool && lower(p.args.collection ?? ZERO) === lower(origin.args.collection) &&
      String(p.args.tokenId) === String(origin.args.tokenId);
    // Rebuild the stake/lock round. Current stakerOf is cleared by Keep and can
    // refer to a different stake after restaking; neither current state nor cash
    // amount matching can identify this historical obligation.
    const lock = logs.filter(p => sameCard(p) && p.name === 'CardLocked' && order(p, origin) < 0).at(-1);
    if (!lock || lock.transactionHash !== origin.transactionHash || lower(lock.args.holder) !== lower(l.address))
      throw new Error(`TopMarket: missing matching TokenStakingPool lock ${eventId(l)}`);
    const stake = logs.filter(p => sameCard(p) && ['TokenStaked', 'TokenUnstaked', 'CardSettledKeep'].includes(p.name) && order(p, lock) < 0).at(-1);
    if (!stake || stake.name !== 'TokenStaked') throw new Error(`TopMarket: missing historical token staker ${eventId(l)}`);
    const settled = logs.filter(p => lower(p.address) === pool && p.transactionHash === l.transactionHash &&
      ['CardSettledKeep', 'CardSettledReturn'].includes(p.name) && order(p, l) < 0).at(-1);
    const keep = l.name === 'WinKept';
    if (!settled || !sameCard(settled) || settled.name !== (keep ? 'CardSettledKeep' : 'CardSettledReturn') ||
      usedPoolSettlements.has(eventId(settled)) || (keep && lower(settled.args.to) !== lower(l.args.winner)) ||
      uint(keep ? settled.args.amount : settled.args.stakerShare) !== uint(keep ? l.args.stakerPayout : l.args.stakerShare))
      throw new Error(`TopMarket: mismatched token pool settlement ${eventId(l)}`);
    if (logs.some(p => sameCard(p) && order(lock, p) < 0 && order(p, settled) < 0 &&
      ['CardLocked', 'LockRescued', 'TokenStaked', 'TokenUnstaked', 'CardSettledKeep', 'CardSettledReturn'].includes(p.name)))
      throw new Error(`TopMarket: token stake/lock round changed before settlement ${eventId(l)}`);
    // Unknown upgrades anywhere during a stake round invalidate the reconstruction.
    const version = logs.filter(p => lower(p.address) === pool && p.name === 'Upgraded' && order(p, stake) < 0).at(-1);
    if (lower(version?.args.implementation ?? ZERO) !== TOKEN_POOL_VERSION || logs.some(p => lower(p.address) === pool &&
      p.name === 'Upgraded' && order(stake, p) <= 0 && order(p, settled) <= 0 && lower(p.args.implementation) !== TOKEN_POOL_VERSION))
      throw new Error(`TopMarket: unverified token pool version ${eventId(l)}`);
    usedPoolSettlements.add(eventId(settled));
    return { winner: origin.args.winner, collection: origin.args.collection, tokenId: String(origin.args.tokenId),
      price: String(origin.args.price), staker: lower(stake.args.staker) };
  }

  for (const l of logs) {
    const a = l.args, address = lower(l.address), box = boxes[address];
    const nonstandard = box?.kind === 'nonstandard';
    const verifiedBox = nonstandard ? TOKEN_BOX_VERSIONS.has(tokenBoxVersion!) : !!BOX_VERSIONS[boxVersion!];
    const sourceScoped = nonstandard ? verifiedBox : BOX_VERSIONS[boxVersion!]?.sourceScoped;
    if (l.name === 'Upgraded') {
      if (address === MARKET) marketVersion = lower(a.implementation);
      if (address === BEACON) boxVersion = lower(a.implementation);
      if (address === TOKEN_BEACON) tokenBoxVersion = lower(a.implementation);
      continue;
    }
    if (address === MARKET && l.name === 'FeeBpsUpdated') { rate = uint(a.feeBps); continue; }
    if (address === MARKET && l.name === 'FeeRecipientUpdated') { recipient = lower(a.feeRecipient); continue; }
    if (box && l.name === 'BoxFeeRecipientUpdated') { box.feeRecipient = lower(a.newRecipient); continue; }
    if (box && l.name === 'TreasuryUpdated') { box.treasury = lower(a.newTreasury); continue; }
    if (box && l.name === 'JackpotSet') { box.jackpot = lower(a.jackpot); continue; }
    if (box && l.name === 'RandomnessSourceSet') {
      if (!sourceScoped || lower(a.previous) !== (sources.get(address) ?? ZERO) || lower(a.current) === ZERO)
        throw new Error(`TopMarket: inconsistent randomness source history ${eventId(l)}`);
      sources.set(address, lower(a.current)); continue;
    }
    if (box && ['DrawRequested', 'Won', 'DrawRefunded', 'RequestRescued'].includes(l.name) &&
      sourceChanges.has(`${address}:${lower(l.transactionHash)}`))
      throw new Error(`TopMarket: same-transaction randomness source ambiguity ${eventId(l)}`);
    if (box && l.name === 'DrawRequestedVia') {
      const key = markerKey(l);
      if (!BOX_VERSIONS[boxVersion!]?.sourceScoped || markers.has(key))
        throw new Error(`TopMarket: invalid or duplicate source marker ${eventId(l)}`);
      markers.set(key, l); continue;
    }
    if (box && l.name === 'VoucherRedeemed' && inWindow(l) && !excluded(l))
      throw new Error(`TopMarket: vouchers are outside the verified phase-1 scope ${eventId(l)}`);

    if (box && l.name === 'DrawRequested') {
      const source = sources.get(address) ?? ZERO, marker = markers.get(markerKey(l));
      if (nonstandard ? source === ZERO || lower(a.source ?? ZERO) !== source || !!marker :
        source === ZERO ? !!marker : !marker || lower(marker.args.source) !== source || marker.logIndex + 1 !== l.logIndex)
        throw new Error(`TopMarket: missing/inconsistent DrawRequestedVia ${eventId(l)}`);
      markers.delete(markerKey(l));
      const key = requestKey(address, source, a.requestId);
      if (requests.has(key)) throw new Error(`TopMarket: duplicate request ${key}`);
      requests.set(key, l);
      if (!inWindow(l) || excluded(l)) continue;
      if (!verifiedBox) throw new Error(`TopMarket: unverified monetary BlindBox version ${nonstandard ? tokenBoxVersion : boxVersion}`);
      if (uint(a.paid) > 0n && lower(box.treasury) !== TREASURY) throw new Error(`TopMarket: unclassified Gacha treasury ${box.treasury}`);
      if (![ZERO, EXCLUDED_JACKPOT].includes(lower(box.jackpot)) ||
        (uint(a.fee) > 0n && ![TREASURY, EXCLUDED_JACKPOT].includes(lower(box.feeRecipient))))
        throw new Error(`TopMarket: Jackpot/external fee allocation requires verified wiring at ${eventId(l)}`);
      if (nonstandard && uint(a.fee) > uint(a.paid)) throw new Error(`TopMarket: fee exceeds gross payment ${eventId(l)}`);
      const paid = uint(a.paid) + (nonstandard ? 0n : uint(a.fee));
      if (paid === 0n) throw new Error(`TopMarket: free draw outside phase-1 scope ${eventId(l)}`);
      // Gross card-sales Volume is unchanged. This excluded product's fee is
      // neither card Fees nor supplier revenue; its prizes are also out of scope.
      // Replayed recipient changes preserve fees collected before/after rewiring.
      const jackpotFee = lower(box.feeRecipient) === EXCLUDED_JACKPOT ? uint(a.fee) : 0n;
      add(l, box.token, 'Gacha Pack Sales', paid, paid - jackpotFee);
    } else if (box && l.name === 'Won') {
      const key = winKey(address, a.winId);
      if (wins.has(key)) throw new Error(`TopMarket: duplicate win ${key}`);
      wins.set(key, l);
      const request = requestKey(address, sources.get(address) ?? ZERO, a.requestId);
      if (resolvedRequests.has(request)) throw new Error(`TopMarket: duplicate request resolution ${request}`);
      resolvedRequests.add(request);
      winRequests.set(key, request);
    } else if (box && ['DrawRefunded', 'RequestRescued'].includes(l.name)) {
      const key = requestKey(address, sources.get(address) ?? ZERO, a.requestId), origin = requireValue(requests.get(key), `missing refund origin ${key}`);
      if (resolvedRequests.has(key)) throw new Error(`TopMarket: duplicate refund ${key}`);
      resolvedRequests.add(key);
      if (!inWindow(l) || excluded(l) || excluded(origin)) continue;
      if (!verifiedBox) throw new Error(`TopMarket: unverified refund version ${nonstandard ? tokenBoxVersion : boxVersion}`);
      if (lower(a.player) !== lower(origin.args.player) || uint(a.amount) !== uint(origin.args.paid))
        throw new Error(`TopMarket: refund disagrees with request ${key}`);
      add(l, box.token, 'Gacha Refunds', -(uint(origin.args.paid) + (nonstandard ? 0n : uint(origin.args.fee))), -uint(a.amount));
    } else if (box && ['WinKept', 'WinRecycled'].includes(l.name)) {
      const key = winKey(address, a.winId), origin = requireValue(wins.get(key), `missing Won ${key}`);
      const request = requireValue(requests.get(winRequests.get(key)!), `missing draw for ${key}`);
      if (settledWins.has(key)) throw new Error(`TopMarket: duplicate settlement ${key}`);
      settledWins.add(key);
      if (!inWindow(l) || excluded(l) || excluded(origin) || excluded(request)) continue;
      if (!verifiedBox) throw new Error(`TopMarket: unverified settlement version ${nonstandard ? tokenBoxVersion : boxVersion}`);
      const w = nonstandard ? tokenWin(l, origin) : requireValue(context.wins[key], `missing ten-field wins() context ${key}`);
      if (lower(w.winner) !== lower(a.winner) || lower(w.winner) !== lower(origin.args.winner) ||
        lower(w.winner) !== lower(request.args.player) || lower(w.collection) !== lower(origin.args.collection) ||
        w.tokenId !== String(origin.args.tokenId) || uint(w.price) !== uint(origin.args.price))
        throw new Error(`TopMarket: inconsistent win context ${key}`);
      collection(w.collection);
      if (l.name === 'WinKept') {
        if (uint(a.stakerPayout) !== uint(w.price)) throw new Error(`TopMarket: inconsistent Keep ${key}`);
        supplier(l, w, uint(a.stakerPayout), 'Gacha Keep To Suppliers');
      } else {
        if ((!nonstandard && lower(a.staker) !== lower(w.staker)) || uint(a.recyclePrice) + uint(a.stakerShare) > uint(w.price))
          throw new Error(`TopMarket: inconsistent Recycle ${key}`);
        add(l, box.token, 'Gacha Card Buybacks', 0n, -uint(a.recyclePrice));
        supplier(l, w, uint(a.stakerShare), 'Gacha Recycle To Suppliers');
      }
    } else if (address === MARKET && l.name === 'AuctionCreated') {
      const version = requireValue(MARKET_VERSIONS[marketVersion!], `unverified auction creation version ${marketVersion}`);
      if (auctions.has(String(a.auctionId))) throw new Error(`TopMarket: duplicate auction ${a.auctionId}`);
      auctions.set(String(a.auctionId), { origin: l, snapshot: version.auctionSnapshot ? rate : undefined });
    } else if (address === MARKET && ['Sold', 'OfferAccepted', 'AuctionSettled'].includes(l.name)) {
      if (!inWindow(l) || excluded(l)) continue;
      const version = requireValue(MARKET_VERSIONS[marketVersion!], `unverified Marketplace version ${marketVersion}`);
      // Owner setters can run in receiver callbacks before the final trade event. Without
      // a call trace that tx's event order cannot locate the fee read; fail, do not guess.
      if (marketChanges.has(lower(l.transactionHash))) throw new Error(`TopMarket: same-transaction fee/upgrade ambiguity ${eventId(l)}`);
      let nft = a.nft, token = a.currency, amount = uint(a.price ?? a.amount), feeRate = rate;
      let seller = a.seller, buyer = a.buyer;
      if (l.name === 'AuctionSettled') {
        if (lower(a.winner) === ZERO && amount === 0n) continue;
        if (lower(a.winner) === ZERO || amount === 0n) throw new Error(`TopMarket: invalid auction settlement ${eventId(l)}`);
        const auction = requireValue(auctions.get(String(a.auctionId)), `missing AuctionCreated ${a.auctionId}`);
        // Creation is not a sale. An earlier listing/auction may legitimately sell
        // inside the window; only an explicitly excluded origin taints settlement.
        if (policy.excludedTransactions[lower(auction.origin.transactionHash)]) continue;
        nft = auction.origin.args.nft; token = auction.origin.args.currency;
        seller = auction.origin.args.seller; buyer = a.winner;
        feeRate = auctionFeeBps(auction.snapshot, rate);
        auctions.delete(String(a.auctionId));
      }
      collection(nft);
      if (lower(token) === ZERO && !version.native) throw new Error(`TopMarket: native settlement in ERC20-only Marketplace ${eventId(l)}`);
      if (lower(seller) === lower(buyer)) continue; // Observable self-trades are not card sales.
      if (feeRate > 1000n) throw new Error(`TopMarket: fee exceeds verified contract cap ${feeRate}`); // MAX_FEE_BPS
      const fee = amount * feeRate / 10000n; // BPS_DENOMINATOR in verified Marketplace.sol
      if (fee > 0n && recipient !== TREASURY) throw new Error(`TopMarket: unclassified fee recipient ${recipient}`);
      add(l, token, 'Marketplace Trading Fees', amount, fee);
    }
    // Escrow, deferred, withdrawal, ERC20 Transfer, listings and bids are deliberately
    // not economic increments. IDs join obligations; equal cash amounts never do.
  }
  if (markers.size) throw new Error('TopMarket: DrawRequestedVia without paired DrawRequested');
  return { entries, unresolved };
}
