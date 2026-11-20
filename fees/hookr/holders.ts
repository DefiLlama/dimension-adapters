import {
  BLOCK,
  CONTRACT,
  DEAD,
  FeeAccounting,
  HOLDERS,
  NATIVE,
  addCurrency,
  addressTopic,
  byPosition,
  eventTopic,
  lowercase,
  toBigInt,
} from './common';

const TRANSFER = 'event Transfer(address indexed from,address indexed to,uint256 value)';
const SWAP =
  'event Swap(bytes32 indexed id,address indexed sender,int128 amount0,int128 amount1,uint160 sqrtPriceX96,' +
  'uint128 liquidity,int24 tick,uint24 fee)';

// OpenZaps (https://www.0xzaps.com/rewards) campaigns buy HOOKR with ETH from the OpenZaps fee vault
// 0x31d6787b7c2c347ffb5b58171e33e9c5132a7338 and burn it, in the hookless ETH/HOOKR pool below.
const OPENZAPS_CAMPAIGNS = ['0xb5f7d9d4269c897df70df26f7ba48c0d933be8db', '0xc6e444f170259a18b444821db4202d97b4136536'];
const BUYBACK_POOL = '0x590dcb6a87828bf688b48089a62239b693378f1fb64d2286e6a399ed8c005fdf';

/** Value spent to burn HOOKR, measured in what was paid for it rather than at the HOOKR price. */
export async function fetchHolderRevenue(accounting: FeeAccounting) {
  const holders = accounting.balances.dailyHoldersRevenue;

  // The flywheel burner reports the ETH it spent; its funding was deducted from protocol revenue at accrual.
  for (const log of await accounting.getLogs(
    [CONTRACT.legacyBurner],
    'event BuybackBurned(address indexed caller,uint256 ethIn,uint256 hookrBurned)',
  )) {
    addCurrency(holders, NATIVE, toBigInt(log.args.ethIn), HOLDERS.legacy);
  }

  await fetchOpenZapsBuybacks(accounting);
  await fetchJarReleases(accounting);
}

/** OpenZaps' ETH spent on HOOKR that was burned in the same transaction. External money: not a Hookr fee. */
async function fetchOpenZapsBuybacks(accounting: FeeAccounting) {
  const burned = new Map<string, bigint>(); // `${tx}:${sender}` => HOOKR burned
  for (const log of await accounting.getLogs([CONTRACT.hookr], TRANSFER, {
    topics: [eventTopic(TRANSFER), null, addressTopic(DEAD)],
  })) {
    const key = `${log.transactionHash}:${lowercase(log.args.from)}`;
    burned.set(key, (burned.get(key) ?? 0n) + toBigInt(log.args.value));
  }

  const bought = new Map<string, { eth: bigint; hookr: bigint }>();
  for (const log of await accounting.getLogs([CONTRACT.poolManager], SWAP, {
    topics: [eventTopic(SWAP), BUYBACK_POOL, OPENZAPS_CAMPAIGNS.map(addressTopic)] as any,
  })) {
    const amount0 = toBigInt(log.args.amount0); // ETH, negative when paid in
    const amount1 = toBigInt(log.args.amount1); // HOOKR, positive when bought
    if (amount0 >= 0n || amount1 <= 0n) continue;
    const key = `${log.transactionHash}:${lowercase(log.args.sender)}`;
    const purchase = bought.get(key) ?? { eth: 0n, hookr: 0n };
    bought.set(key, { eth: purchase.eth - amount0, hookr: purchase.hookr + amount1 });
  }

  for (const [key, { eth, hookr }] of bought) {
    if (burned.get(key) === hookr) addCurrency(accounting.balances.dailyHoldersRevenue, NATIVE, eth, HOLDERS.openzaps);
  }
}

/**
 * Since 2026-10-31 the treasury pays into a 50/50 split: half to the Safe, half to a jar that hands its assets to
 * whoever burns the required HOOKR. The jar's claims on the split are replayed from the start so each release is
 * valued at the fee assets it hands out. A claim leaves protocol revenue when made; a release is holders revenue.
 */
async function fetchJarReleases(accounting: FeeAccounting) {
  const claims = (
    await accounting.getLogs(
      [CONTRACT.split],
      'event RevenueClaimed(address indexed currency,address indexed account,address indexed to,uint256 amount)',
      { fromBlock: BLOCK.split },
    )
  ).filter(log => lowercase(log.args.account) === CONTRACT.jar && lowercase(log.args.to) === CONTRACT.jar);
  const releases = await accounting.getLogs(
    [CONTRACT.releaser],
    'event Released(uint256 indexed nonce,address indexed recipient,address indexed resource,address resourceRecipient,' +
      'uint256 threshold,uint256 fee,address feeRecipient,address[] assets)',
    { fromBlock: BLOCK.jar },
  );

  const inventory = new Map<string, bigint>();
  const events = [...claims.map(log => ({ log, release: false })), ...releases.map(log => ({ log, release: true }))].sort(
    (a, b) => byPosition(a.log, b.log),
  );
  for (const { log, release } of events) {
    const inWindow = log.blockNumber >= accounting.fromBlock;
    if (!release) {
      const currency = lowercase(log.args.currency);
      const amount = toBigInt(log.args.amount);
      inventory.set(currency, (inventory.get(currency) ?? 0n) + amount);
      if (inWindow) accounting.setAsideForBurns(currency, amount);
      continue;
    }
    const { resource, resourceRecipient, threshold, assets } = log.args;
    const burnsHookr =
      lowercase(resource) === CONTRACT.hookr && lowercase(resourceRecipient) === DEAD && toBigInt(threshold) > 0n;
    for (const asset of new Set<string>(assets.map(lowercase))) {
      const released = inventory.get(asset) ?? 0n;
      if (inWindow && burnsHookr) addCurrency(accounting.balances.dailyHoldersRevenue, asset, released, HOLDERS.jar);
      inventory.set(asset, 0n); // a release hands out the jar's whole balance of each listed asset
    }
  }
}
