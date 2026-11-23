import {
  BLOCK,
  CONTRACT,
  Context,
  HOLDERS,
  NATIVE,
  eventTopic,
  getLogs,
  lowercase,
  recordFees,
  recordTokenBurn,
  toBigInt,
  toHolders,
} from './common';

type Pool = { root: string; rules: string; subject: string; quote: string };

const POOL_CONFIG =
  'function poolConfig(bytes32) view returns((address subject,address quote,address rules,address advisory,' +
  'address liquidityOwner,uint24 baseLpFeePips,(uint24 maxLpFeePips,uint24 maxQuoteTakePips,' +
  'uint16 maxSubjectTakeBps) caps,uint32 rulesGasLimit,uint32 advisoryGasLimit,uint8 advisoryPhases,' +
  'bool advisoryFailOpen,bytes32 policyId))';

// Both published Tax + Conversion (directional tax) revisions:
// https://github.com/Hookr-fun/hookr-contracts/tree/main/hookr-1/hook-blocks/directional-tax
const TAX_BLOCKS = ['0x99012422e1acbdf53c42bb378eb2f4e468005d3c', '0xe73fad0d773b9571a7a9d2a1edc01132ff5f1e1f'];

/** Hookr 1 pools on registered roots whose Rules pay Hookr's treasury, and the tax queues bound to them. */
async function discoverPools(ctx: Context) {
  const history = { fromBlock: BLOCK.registry, cacheInCloud: true }; // registry deployed just before the first root
  const roots = new Set<string>([CONTRACT.root]);
  for (const eventAbi of [
    'event RootRegistered(address indexed root)',
    'event FactoryRootRegistered(address indexed factory,address indexed root)',
    'event OwnedRootRegistered(address indexed root,address indexed factory,address indexed template,address rules)',
  ]) {
    for (const log of await getLogs(ctx, [CONTRACT.registry], eventAbi, history)) roots.add(lowercase(log.args.root));
  }

  const opened = await getLogs(
    ctx,
    [...roots],
    'event PoolOpened(bytes32 indexed id,address indexed launcher,bytes32 indexed policyHash,address rules,address advisory)',
    history,
  );
  const allRules = [...new Set(opened.map(log => lowercase(log.args.rules)))];
  const recipients = await ctx.options.api.multiCall({ abi: 'address:protocolRecipient', calls: allRules });
  const hookrRules = new Set(allRules.filter((_, i) => lowercase(recipients[i]) === CONTRACT.treasury));
  const included = opened.filter(log => hookrRules.has(lowercase(log.args.rules)));
  const configs = await ctx.options.api.multiCall({
    abi: POOL_CONFIG,
    calls: included.map(log => ({ target: log.address, params: [log.args.id] })),
  });
  const pools = new Map<string, Pool>();
  included.forEach((log, i) =>
    pools.set(lowercase(log.args.id), {
      root: log.address,
      rules: lowercase(log.args.rules),
      subject: lowercase(configs[i].subject),
      quote: lowercase(configs[i].quote),
    }),
  );

  const queues = new Map<string, string>(); // tax queue => the pool quote it settles in
  for (const log of await getLogs(
    ctx,
    TAX_BLOCKS,
    'event DirectionalTaxBound(address indexed root,bytes32 indexed id,uint24 buyTaxPips,address buyQueue,' +
      'uint24 sellTaxPips,address sellQueue,uint16 protocolShareBps,address protocolRecipient)',
    history,
  )) {
    const pool = pools.get(lowercase(log.args.id));
    if (pool?.root !== lowercase(log.args.root) || lowercase(log.args.protocolRecipient) !== CONTRACT.treasury) continue;
    for (const queue of [log.args.buyQueue, log.args.sellQueue]) {
      if (lowercase(queue) !== NATIVE) queues.set(lowercase(queue), pool.quote);
    }
  }
  return { pools, queues };
}

/** Hook Block charges, tax settlements, recaptured arbitrage, launch fees and vault fees of Hookr 1. */
export async function fetchPoolFees(ctx: Context) {
  const { pools, queues } = await discoverPools(ctx);
  const roots = [...new Set([...pools.values()].map(pool => pool.root))];
  const rules = [...new Set([...pools.values()].map(pool => pool.rules))];
  // Rules contracts can emit for pools outside this set; skip those.
  const isOwnPool = (id: string, rulesAddress: string) => pools.get(lowercase(id))?.rules === rulesAddress;

  // `protocol` is already net of the integrator's cut, which IntegratorPaid reports (HookrRules.settleSwap).
  for (const log of await getLogs(
    ctx,
    rules,
    'event FeesAllocated(bytes32 indexed id,address indexed quote,uint256 protocol,uint256 royalty,uint256 refund,' +
      'address advisoryRecipient,uint256 advisoryFee)',
  )) {
    const { id, quote, protocol, royalty, advisoryRecipient, advisoryFee } = log.args;
    if (!isOwnPool(id, log.address)) continue;
    // A tax queue's credit is counted when the queue settles it, below.
    const advisory = queues.has(lowercase(advisoryRecipient)) ? 0n : toBigInt(advisoryFee);
    recordFees(ctx, 'swap', quote, toBigInt(protocol) + toBigInt(royalty) + advisory, toBigInt(protocol));
  }

  for (const log of await getLogs(
    ctx,
    rules,
    'event IntegratorPaid(bytes32 indexed id,address indexed quote,address indexed integrator,uint256 amount)',
  )) {
    if (isOwnPool(log.args.id, log.address)) recordFees(ctx, 'swap', log.args.quote, toBigInt(log.args.amount), 0n);
  }

  // The part of a hook fee taken in the pool's own token and burned.
  for (const log of await getLogs(
    ctx,
    roots,
    'event HookFee(bytes32 indexed id,address indexed quote,uint256 earned,uint256 refund,uint256 burned)',
  )) {
    const pool = pools.get(lowercase(log.args.id));
    if (pool?.root === log.address) recordTokenBurn(ctx, pool.subject, toBigInt(log.args.burned));
  }

  for (const eventAbi of [
    'event Settled(uint256 income,uint256 protocolAmount,uint256 creatorAmount)',
    'event ClaimPaidAsClaims(uint256 claim,address indexed protocolTo,uint256 protocolAmount,' +
      'address indexed creatorRecipient,uint256 creatorAmount)',
  ]) {
    for (const log of await getLogs(ctx, [...queues.keys()], eventAbi)) {
      const protocol = toBigInt(log.args.protocolAmount);
      recordFees(ctx, 'tax', queues.get(log.address)!, protocol + toBigInt(log.args.creatorAmount), protocol);
    }
  }

  // Arbitrage profit What The Hook pushes into the pool, as the Rules split it. What The Hook's own retained leg
  // (its ProfitRecaptured treasuryAmount) is its revenue and stays in fees/what-the-hook.ts.
  for (const log of await getLogs(
    ctx,
    rules,
    'event RecaptureSplit(bytes32 indexed id,address indexed trader,uint256 traderAmount,uint256 lp,uint256 pot,' +
      'uint256 protocol,address currency,uint256 reportedProfit)',
  )) {
    const { id, currency, traderAmount, lp, pot, protocol } = log.args;
    if (!isOwnPool(id, log.address)) continue;
    const total = toBigInt(protocol) + toBigInt(traderAmount) + toBigInt(lp) + toBigInt(pot);
    recordFees(ctx, 'recapture', currency, total, toBigInt(protocol));
  }

  const launchFees = [
    ...(await getLogs(ctx, [CONTRACT.launcher], 'event LaunchFeePaid(bytes32 indexed familyId,address indexed target,uint256 fee)')),
    ...(await getLogs(ctx, [CONTRACT.rootFactory], 'event DeployFeePaid(address indexed root,address indexed target,uint256 fee)')),
  ];
  for (const log of launchFees) recordFees(ctx, 'launch', NATIVE, toBigInt(log.args.fee), toBigInt(log.args.fee));

  // Since 2026-10-31 the treasury pays Hookr's fees into a 50/50 split: half to the Safe, half to the burn jar.
  // The jar's claims move that half from protocol revenue to holders revenue.
  for (const log of await getLogs(
    ctx,
    [CONTRACT.split],
    'event RevenueClaimed(address indexed currency,address indexed account,address indexed to,uint256 amount)',
  )) {
    const { currency, account, to, amount } = log.args;
    if (lowercase(account) === CONTRACT.jar && lowercase(to) === CONTRACT.jar) {
      toHolders(ctx, currency, toBigInt(amount), HOLDERS.jar);
    }
  }

  await fetchVaultFees(ctx);
}

/** The vault's skim of the LP fees it realizes; the LP fees themselves are not counted. */
async function fetchVaultFees(ctx: Context) {
  // https://github.com/Hookr-fun/hookr-contracts/blob/main/hookr-1/src/extensions/HookrLiquidityVault.sol
  const charged = (
    await getLogs(
      ctx,
      [CONTRACT.liquidityVault],
      'event FeesRealized(uint256 indexed id,uint256 fees0,uint256 fees1,uint256 skim0,uint256 skim1)',
    )
  ).filter(log => toBigInt(log.args.skim0) + toBigInt(log.args.skim1) > 0n);
  if (!charged.length) return;

  const ids = [...new Set(charged.map(log => log.args.id.toString()))];
  const ranges = await ctx.options.api.multiCall({
    target: CONTRACT.liquidityVault,
    abi:
      'function range(uint256) view returns((bytes32 poolId,int24 tickLower,int24 tickUpper,' +
      'uint256 feesPerShare0X128,uint256 feesPerShare1X128))',
    calls: ids,
  });
  // FeesRealized has no currencies; they come from the pool's Initialize event.
  const initialize =
    'event Initialize(bytes32 indexed id,address indexed currency0,address indexed currency1,uint24 fee,' +
    'int24 tickSpacing,address hooks,uint160 sqrtPriceX96,int24 tick)';
  const initialized = await getLogs(ctx, [CONTRACT.poolManager], initialize, {
    fromBlock: 1,
    cacheInCloud: true,
    topics: [eventTopic(initialize), [...new Set(ranges.map((range: any) => lowercase(range.poolId)))]] as any,
  });
  const currencies = new Map(initialized.map(log => [lowercase(log.args.id), [log.args.currency0, log.args.currency1]]));
  const rangeCurrencies = new Map(ids.map((id, i) => [id, currencies.get(lowercase(ranges[i].poolId))]));

  for (const log of charged) {
    const tokens = rangeCurrencies.get(log.args.id.toString());
    if (!tokens) throw new Error('Hookr: liquidity vault pool currencies not found');
    recordFees(ctx, 'vault', tokens[0], toBigInt(log.args.skim0), toBigInt(log.args.skim0));
    recordFees(ctx, 'vault', tokens[1], toBigInt(log.args.skim1), toBigInt(log.args.skim1));
  }
}
