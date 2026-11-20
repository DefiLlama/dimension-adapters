import { ARB_EXECUTORS, CONTRACT, FeeAccounting, HookrLog, NATIVE, OLD_ROOTS, byPosition, lowercase, toBigInt } from './common';

// Generation 3 to 5 launchpads (https://github.com/Hookr-fun/hookr-contracts/tree/main/legacy).
// Generations 3 and 4 share the bonding-curve launch struct; generation 5 uses auctions.
const HOOK_PARAMS =
  '(uint32 guardBlocks, uint16 maxBuyBps, uint24 snipeTaxPips, uint24 baseFeePips, uint24 maxFeePips,' +
  ' uint16 surgeSens, uint16 burnBps, uint96 burnTriggerWei, uint16 lpBps, uint16 potBps,' +
  ' uint32 potEveryNBuys, uint96 potMinBuyWei) hookParams';
const CURVE_GET_LAUNCH =
  'function getLaunch(address token) view returns ((address token, address creator, uint40 launchBlock,' +
  ' uint32 blueprintId, bool graduated, uint96 basePriceWei, uint96 targetWei, uint96 reserveWei,' +
  ' uint128 soldTokens, uint40 graduatedAtBlock, uint160 sqrtPriceX96AtGraduation, bytes32 poolId, ' +
  HOOK_PARAMS +
  '))';
const AUCTION_GET_LAUNCH =
  'function getLaunch(address token) view returns ((address token, address creator, uint40 launchBlock,' +
  ' uint32 blueprintId, uint8 mode, uint8 status, uint96 openPriceWei, uint96 openFdvWei, uint16 reserveBps,' +
  ' address auction, uint40 auctionEndBlock, uint40 migratedAtBlock, uint160 sqrtPriceX96AtOpen,' +
  ' bytes32 poolId, uint8 quote, ' +
  HOOK_PARAMS +
  '))';
const CURVE_LAUNCHED =
  'event TokenLaunched(address indexed token, address indexed creator, uint32 indexed blueprintId,' +
  ' string name, string symbol, string tagline, string logoURI, uint96 targetWei, uint96 basePriceWei)';

const LAUNCHPADS = [
  {
    generation: 3,
    address: '0xaaed6fab06d53311220f35421dda5cc6d6e9d6c3',
    block: 27763919,
    getLaunch: CURVE_GET_LAUNCH,
    launched: CURVE_LAUNCHED,
  },
  {
    generation: 4,
    address: '0x5ce779d23d2e99d322004f203813389b6a426e3b',
    block: 33485079,
    getLaunch: CURVE_GET_LAUNCH,
    launched: CURVE_LAUNCHED,
  },
  {
    generation: 5,
    address: '0xa043cabe645636899dde91cce4693c00a015e660',
    block: 41850162,
    getLaunch: AUCTION_GET_LAUNCH,
    launched:
      'event TokenLaunched(address indexed token, address indexed creator, uint32 indexed blueprintId,' +
      ' uint8 mode, string name, string symbol, string tagline, string logoURI)',
  },
];
type Launchpad = (typeof LAUNCHPADS)[number];
type LaunchpadEvent = { log: HookrLog; kind: 'price' | 'launch' | 'buy' | 'sell' | 'graduate' | 'lp' | 'withdraw' };

const DEFAULT_CREATION_FEE = 200_000_000_000_000n; // 0.0002 ETH, set by all three constructors

/** Fees of every pre-Hookr 1 release. */
export async function fetchLegacyFees(accounting: FeeAccounting) {
  await fetchLaunchpadFees(accounting);
  await fetchModularFees(accounting);

  for (const log of await accounting.getLogs(
    [CONTRACT.legacyHook],
    'event FlywheelFeeAccrued(bytes32 indexed poolId,uint256 amountWei)',
  )) {
    const amount = toBigInt(log.args.amountWei);
    accounting.recordFees('flywheel', NATIVE, amount, amount);
    accounting.setAsideForBurns(NATIVE, amount); // the hook credits it to the HOOKR buy-and-burn contract
  }

  // Arbitrage the Hookr integration ran on its own account. wthProtocolAmount is What The Hook's revenue,
  // counted in fees/what-the-hook.ts, so it is left out here.
  for (const log of await accounting.getLogs(
    ARB_EXECUTORS,
    'event ArbitrageProfitSplit(address indexed profitCurrency,address indexed trader,address indexed creator,' +
      'uint256 totalProfit,uint256 traderAmount,uint256 creatorAmount,uint256 triggerPoolAmount,' +
      'uint256 wthProtocolAmount,uint256 hookrProtocolAmount)',
  )) {
    const { profitCurrency, totalProfit, wthProtocolAmount, hookrProtocolAmount } = log.args;
    const gross = toBigInt(totalProfit) - toBigInt(wthProtocolAmount);
    accounting.recordFees('recapture', profitCurrency, gross, toBigInt(hookrProtocolAmount));
  }
}

/**
 * Gross fees are rebuilt from launch, curve and pool-fee events; Hookr's share is the change in each launchpad's
 * protocolFeesWei counter plus withdrawals. The creators' share is the difference.
 */
async function fetchLaunchpadFees(accounting: FeeAccounting) {
  const launchpads = LAUNCHPADS.filter(launchpad => launchpad.block <= accounting.toBlock);
  if (!launchpads.length) return;
  const { api } = accounting.options;
  const targets = launchpads.map(launchpad => launchpad.address);
  const existing = launchpads.filter(launchpad => launchpad.block < accounting.fromBlock).map(launchpad => launchpad.address);
  const events = await getLaunchpadEvents(accounting, launchpads);

  const openingCounters = await accounting.openingApi.multiCall({ abi: 'uint256:protocolFeesWei', calls: existing });
  const closingCounters = await api.multiCall({ abi: 'uint256:protocolFeesWei', calls: targets });
  const openingCreationFees = await accounting.openingApi.multiCall({
    abi: 'function creationFeeWei() view returns(uint96)',
    calls: existing,
  });
  const openingProtocolFees = new Map(existing.map((address, i) => [address, toBigInt(openingCounters[i])]));
  const creationFees = new Map(targets.map(address => [address, DEFAULT_CREATION_FEE]));
  existing.forEach((address, i) => creationFees.set(address, toBigInt(openingCreationFees[i])));
  const reserves = await readOpeningReserves(accounting, launchpads, events);

  // Generation-5 pools can be quoted in HOOKR (quote == 1) instead of ETH.
  const auction = LAUNCHPADS[2];
  const auctionTokens = [
    ...new Set(events.filter(e => e.kind === 'lp' && e.log.address === auction.address).map(e => lowercase(e.log.args.token))),
  ];
  const auctionTerms = await api.multiCall({ target: auction.address, abi: auction.getLaunch, calls: auctionTokens });
  const hookrQuoted = new Set(auctionTokens.filter((_, i) => Number(auctionTerms[i].quote) === 1));

  const gross = new Map<string, bigint>();
  const withdrawn = new Map<string, bigint>();
  const addGross = (address: string, amount: bigint) => {
    if (amount < 0n) throw new Error('Hookr: negative legacy launchpad fee');
    gross.set(address, (gross.get(address) ?? 0n) + amount);
  };

  for (const { log, kind } of events) {
    const event = log.args;
    const key = `${log.address}:${lowercase(event.token)}`;
    if (kind === 'price') creationFees.set(log.address, toBigInt(event.feeWei));
    if (kind === 'launch') {
      addGross(log.address, creationFees.get(log.address)!);
      if (!reserves.has(key)) reserves.set(key, 0n);
    }
    // 1% of the buy input, rounded down.
    if (kind === 'buy') {
      addGross(log.address, toBigInt(event.ethIn) / 100n);
      reserves.set(key, toBigInt(event.reserveWei));
    }
    // Sell and graduation amounts are net of the fee: what leaves the reserve and is not paid out is the fee.
    if (kind === 'sell' || kind === 'graduate') {
      const reserve = reserves.get(key);
      if (reserve === undefined) throw new Error('Hookr: missing opening curve reserve');
      const remaining = kind === 'sell' ? toBigInt(event.reserveWei) : 0n;
      const payout = kind === 'sell' ? toBigInt(event.ethOut) : toBigInt(event.ethLiquidity);
      addGross(log.address, reserve - remaining - payout);
      reserves.set(key, remaining);
    }
    if (kind === 'withdraw') withdrawn.set(log.address, (withdrawn.get(log.address) ?? 0n) + toBigInt(event.amountWei));
    if (kind === 'lp') {
      // HOOKR-quoted pool fees go entirely to the creator.
      if (hookrQuoted.has(lowercase(event.token))) accounting.recordFees('legacy', CONTRACT.hookr, toBigInt(event.ethAmount), 0n);
      else addGross(log.address, toBigInt(event.ethAmount));
      accounting.recordTokenBurn(event.token, toBigInt(event.tokensBurned));
    }
  }

  launchpads.forEach(({ address }, i) => {
    const revenue = toBigInt(closingCounters[i]) - (openingProtocolFees.get(address) ?? 0n) + (withdrawn.get(address) ?? 0n);
    accounting.recordFees('legacy', NATIVE, gross.get(address) ?? 0n, revenue);
  });
}

/** Every generation's fee events, in on-chain order. */
async function getLaunchpadEvents(accounting: FeeAccounting, launchpads: Launchpad[]) {
  const targets = launchpads.map(launchpad => launchpad.address);
  const curves = launchpads.filter(launchpad => launchpad.generation < 5).map(launchpad => launchpad.address);
  const events: LaunchpadEvent[] = [];
  const collect = async (addresses: string[], eventAbi: string, kind: LaunchpadEvent['kind']) => {
    for (const log of await accounting.getLogs(addresses, eventAbi)) events.push({ log, kind });
  };

  await collect(targets, 'event CreationFeeSet(uint96 feeWei)', 'price');
  for (const launchpad of launchpads) await collect([launchpad.address], launchpad.launched, 'launch');
  await collect(
    curves,
    'event CurveBuy(address indexed token,address indexed buyer,uint256 ethIn,uint256 tokensOut,uint96 reserveWei,' +
      'uint128 soldTokens)',
    'buy',
  );
  await collect(
    curves,
    'event CurveSell(address indexed token,address indexed seller,uint256 tokensIn,uint256 ethOut,uint96 reserveWei,' +
      'uint128 soldTokens)',
    'sell',
  );
  await collect(
    curves,
    'event Graduated(address indexed token,bytes32 indexed poolId,uint160 sqrtPriceX96,uint256 ethLiquidity,' +
      'uint256 tokenLiquidity,uint256 tokensBurned)',
    'graduate',
  );
  await collect(targets, 'event PoolFeesCollected(address indexed token,uint256 ethAmount,uint256 tokensBurned)', 'lp');
  await collect(targets, 'event ProtocolFeesWithdrawn(address indexed to,uint256 amountWei)', 'withdraw');

  // Generation 4 also emits Graduated for instant launches, whose ETH is the creator's seed, not a curve reserve.
  // https://robin.etherscan.io/address/0x5ce779d23d2e99d322004f203813389b6a426e3b#code
  const launchKey = (log: HookrLog) => `${log.transactionHash}:${log.address}:${lowercase(log.args.token)}`;
  const instant = new Set(
    (
      await accounting.getLogs(
        curves.filter(address => address === LAUNCHPADS[1].address),
        'event InstantLaunched(address indexed token,bytes32 indexed poolId,uint16 poolSupplyBps,uint96 openPriceWei,' +
          'uint256 ethInPool)',
      )
    ).map(launchKey),
  );
  return events
    .filter(({ log, kind }) => kind !== 'graduate' || !instant.has(launchKey(log)))
    .sort((a, b) => byPosition(a.log, b.log));
}

/** Curve reserves before the window, for tokens that sell or graduate in it (buys report their own reserve). */
async function readOpeningReserves(accounting: FeeAccounting, launchpads: Launchpad[], events: LaunchpadEvent[]) {
  const reserves = new Map<string, bigint>();
  for (const launchpad of launchpads.filter(launchpad => launchpad.block < accounting.fromBlock)) {
    const tokens = [
      ...new Set(
        events
          .filter(({ log, kind }) => log.address === launchpad.address && (kind === 'sell' || kind === 'graduate'))
          .map(({ log }) => lowercase(log.args.token)),
      ),
    ];
    const launches = await accounting.openingApi.multiCall({ target: launchpad.address, abi: launchpad.getLaunch, calls: tokens });
    tokens.forEach((token, i) => reserves.set(`${launchpad.address}:${token}`, toBigInt(launches[i].reserveWei)));
  }
  return reserves;
}

const STACK =
  'function stack(bytes32) view returns((bool configured,bool initialized,address kernel,bytes32 kernelId,' +
  'bytes32 kernelFamilyId,bytes32 kernelCodeHash,address subject,address quote,bytes32 stackHash,' +
  'bytes32 trustedRouterIntegrationId,bytes32 trustedRouterCodeHash,bytes32 trustedQuoterIntegrationId,' +
  'bytes32 trustedQuoterCodeHash,bytes32 correctionExecutorIntegrationId,bytes32 correctionExecutorCodeHash,' +
  'uint8 moduleCount,(uint24 baseLpFeePips,uint24 maxLpFeePips,uint16 maxSpecifiedQuoteTakeBps,' +
  'uint16 maxUnspecifiedQuoteTakeBps,uint16 maxSubjectTakeBps,uint32 maxTotalModuleGas,address trustedRouter,' +
  'address trustedQuoter,address correctionExecutor,address correctionCreator,uint16 correctionMaxVolumeBps,' +
  'uint96 correctionMinProfitQuote,bytes32 correctionFeePolicyId) limits))';

/** Earlier modular release: fee module events for pools whose stack is hosted by a Hookr root. */
async function fetchModularFees(accounting: FeeAccounting) {
  const getEvents = (eventAbi: string) => accounting.getLogs([CONTRACT.mechanics], eventAbi);
  const protocolShares = await getEvents('event ProtocolShareAccrued(bytes32 indexed poolId,uint8 indexed stream,uint256 amount)');
  const supplierFees = await getEvents(
    'event HookFeesAccrued(bytes32 indexed poolId,uint256 burnWei,uint256 lpWei,uint256 potWeiAdded,uint256 royaltyWei,' +
      'address royaltyTo)',
  );
  const burns = await getEvents('event AutoBurn(bytes32 indexed poolId,uint256 tokensBurned)');

  const ids = [...new Set([...protocolShares, ...supplierFees, ...burns].map(log => lowercase(log.args.poolId)))];
  const stacks = await accounting.options.api.multiCall({ target: CONTRACT.v2Registry, abi: STACK, calls: ids });
  const pools = new Map<string, { subject: string; quote: string }>();
  ids.forEach((id, i) => {
    if (OLD_ROOTS.includes(lowercase(stacks[i].kernel))) {
      pools.set(id, { subject: lowercase(stacks[i].subject), quote: lowercase(stacks[i].quote) });
    }
  });
  const poolOf = (log: HookrLog) => pools.get(lowercase(log.args.poolId));

  for (const log of protocolShares) {
    const pool = poolOf(log);
    if (pool) accounting.recordFees('modular', pool.quote, toBigInt(log.args.amount), toBigInt(log.args.amount));
  }
  // burnWei is always 0 in the verified module: the burn is charged in the pool token and reported by AutoBurn.
  for (const log of supplierFees) {
    const pool = poolOf(log);
    const { lpWei, potWeiAdded, royaltyWei } = log.args;
    if (pool) accounting.recordFees('modular', pool.quote, toBigInt(lpWei) + toBigInt(potWeiAdded) + toBigInt(royaltyWei), 0n);
  }
  for (const log of burns) {
    const pool = poolOf(log);
    if (pool) accounting.recordTokenBurn(pool.subject, toBigInt(log.args.tokensBurned));
  }
}
