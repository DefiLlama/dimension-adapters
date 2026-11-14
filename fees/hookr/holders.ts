import {
  ABI,
  FeeAccounting,
  HOLDERS,
  addCurrency,
  toBigInt,
  lowercase,
  compareLogPosition,
  eventTopic,
  addressTopic,
  HookrLog,
} from './common';
import { BLOCK, BUYBACK_POOL, CONTRACT, DEAD, NATIVE } from './config';

/** Verify burns, then value holder income at fee-asset expenditure rather than the HOOKR market price. */
export async function fetchHolderRevenue(accounting: FeeAccounting) {
  const burns = await accounting.getLogs([CONTRACT.hookr], ABI.transfer, {
    topics: [eventTopic(ABI.transfer), null, addressTopic(DEAD)],
  });
  const burnAmounts = new Map<string, bigint>();

  for (const log of burns) {
    const key = `${log.transactionHash}:${lowercase(log.args.from)}`;
    burnAmounts.set(key, (burnAmounts.get(key) ?? 0n) + toBigInt(log.args.value));
  }

  await fetchOpenZapsBuybacks(accounting, burns, burnAmounts);
  await fetchLegacyBuybacks(accounting, burnAmounts);
  await fetchJarRedemptions(accounting, burns);
}

/** External OpenZaps income is the actual ETH input of purchases matched to their HOOKR burns. */
async function fetchOpenZapsBuybacks(
  accounting: FeeAccounting,
  burns: HookrLog[],
  burnAmounts: Map<string, bigint>,
) {
  const buyers = [CONTRACT.openzapsCampaign2, CONTRACT.openzapsCampaign3];
  // Verified PoolManager trade inputs and HOOKR burns avoid custom OpenZaps event definitions.
  // Funding provenance: OpenZaps fee vault 0x31d6787b7c2c347ffb5b58171e33e9c5132a7338.
  // https://www.0xzaps.com/rewards
  const swaps = await accounting.getLogs([CONTRACT.poolManager], ABI.swap, {
    topics: [eventTopic(ABI.swap), BUYBACK_POOL, buyers.map(addressTopic)] as any,
  });
  const bought = new Map<
    string,
    {
      input: bigint;
      output: bigint;
    }
  >();

  for (const log of swaps) {
    const swap = log.args;
    if (
      lowercase(swap.id) !== BUYBACK_POOL ||
      !buyers.includes(lowercase(swap.sender)) ||
      toBigInt(swap.amount0) >= 0n ||
      toBigInt(swap.amount1) <= 0n
    ) {
      throw new Error('Hookr: unexpected OpenZaps buyback trade');
    }

    const key = `${log.transactionHash}:${lowercase(swap.sender)}`;
    const purchase = bought.get(key) ?? { input: 0n, output: 0n };
    purchase.input -= toBigInt(swap.amount0);
    purchase.output += toBigInt(swap.amount1);
    bought.set(key, purchase);
  }

  for (const [key, purchase] of bought) {
    if (burnAmounts.get(key) !== purchase.output) {
      throw new Error('Hookr: OpenZaps purchase does not match its burn');
    }

    // This is EXTERNAL holder income, never Hookr operating fees or an expense against its treasury.
    addCurrency(accounting.balances.dailyHoldersRevenue, NATIVE, purchase.input, HOLDERS.openzaps);
  }

  for (const log of burns) {
    if (
      buyers.includes(lowercase(log.args.from)) &&
      !bought.has(`${log.transactionHash}:${lowercase(log.args.from)}`)
    ) {
      throw new Error('Hookr: external burn lacks verified purchase expenditure');
    }
  }
}

/** The legacy flywheel reports its actual purchase cost; confirm the corresponding tokens were retired. */
async function fetchLegacyBuybacks(accounting: FeeAccounting, burnAmounts: Map<string, bigint>) {
  for (const log of await accounting.getLogs(
    [CONTRACT.legacyBurner],
    'event BuybackBurned(address indexed caller,uint256 ethIn,uint256 hookrBurned)',
  )) {
    const actualBurn = burnAmounts.get(`${log.transactionHash}:${CONTRACT.legacyBurner}`);
    if (actualBurn !== toBigInt(log.args.hookrBurned)) {
      throw new Error('Hookr: legacy buyback/burn mismatch');
    }

    addCurrency(accounting.balances.dailyHoldersRevenue, NATIVE, toBigInt(log.args.ethIn), HOLDERS.legacy);
  }
}

/** Replay fee-funded jar inventory; funding reduces retained income and redemption creates holder income. */
async function fetchJarRedemptions(accounting: FeeAccounting, windowBurns: HookrLog[]) {
  const rotations = await accounting.getLogs(
    [CONTRACT.jar],
    'event ReleaserSet(address indexed oldReleaser,address indexed newReleaser)',
    { fromBlock: BLOCK.jar, cacheInCloud: true },
  );
  if (!rotations.length) {
    return;
  }

  // A replacement releaser may implement different economics. Fail until that deployment is reviewed.
  if (rotations.some(log => lowercase(log.args.newReleaser) !== CONTRACT.releaser)) {
    throw new Error('Hookr: unreviewed jar releaser migration');
  }

  const claims = await accounting.getLogs(
    [CONTRACT.split],
    'event RevenueClaimed(address indexed currency,address indexed account,address indexed to,uint256 amount)',
    { fromBlock: BLOCK.split },
  );
  const releases = await accounting.getLogs(
    [CONTRACT.releaser],
    'event Released(uint256 indexed nonce,address indexed recipient,address indexed resource,' +
      'address resourceRecipient,uint256 threshold,uint256 fee,address feeRecipient,address[] assets)',
    { fromBlock: BLOCK.jar },
  );
  const funding = claims.filter(log => lowercase(log.args.account) === CONTRACT.jar);
  const inventory = new Map<string, bigint>();
  // These event streams are replayed, NOT cloud-cached fee aggregates. Same-transaction funding
  // precedes release in log order, which a block-before/block-after balance delta cannot resolve.
  const sequence = [
    ...funding.map(log => ({ log, release: false })),
    ...releases.map(log => ({ log, release: true })),
  ].sort((firstEvent, secondEvent) => compareLogPosition(firstEvent.log, secondEvent.log));

  for (const { log, release } of sequence) {
    const inWindow = log.blockNumber >= accounting.fromBlock;
    if (!release) {
      const funding = log.args;
      if (lowercase(funding.to) !== CONTRACT.jar) {
        throw new Error('Hookr: jar allocation redirected to another recipient');
      }

      const currency = lowercase(funding.currency);
      const amount = toBigInt(funding.amount);
      inventory.set(currency, (inventory.get(currency) ?? 0n) + amount);
      if (inWindow) {
        accounting.recordBurnFunding(currency, amount);
      }

      continue;
    }

    const redemption = log.args;
    if (
      lowercase(redemption.resource) !== CONTRACT.hookr ||
      lowercase(redemption.resourceRecipient) !== DEAD ||
      toBigInt(redemption.threshold) <= 0n
    ) {
      throw new Error('Hookr: jar release is no longer a HOOKR burn');
    }

    if (inWindow) {
      const matchingBurns = windowBurns.filter(
        burn =>
          burn.transactionHash === log.transactionHash &&
          toBigInt(burn.args.value) === toBigInt(redemption.threshold),
      );
      if (!matchingBurns.length) {
        throw new Error('Hookr: jar redemption lacks its required HOOKR burn');
      }
    }

    for (const asset of new Set<string>(redemption.assets.map(lowercase))) {
      // Only the fee-funded slice has proven cost provenance. Unattributed donations are excluded.
      const amount = inventory.get(asset) ?? 0n;
      if (inWindow) {
        addCurrency(accounting.balances.dailyHoldersRevenue, asset, amount, HOLDERS.jar);
      }

      inventory.set(asset, 0n); // TokenJar releases the entire selected balance, not a percentage.
    }
  }
}
