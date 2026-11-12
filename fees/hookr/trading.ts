import { ABI, FeeAccounting, toBigInt, lowercase, compareLogPosition, eventTopic } from './common';
import { CONTRACT, EXECUTORS, LEGACY_EXECUTORS, OLD_ROOTS } from './config';
import { Discovery, Pool } from './discovery';

/** Count each deployment's earned trading fees, including supplier amounts never sent to treasury. */
export async function fetchTradingFees(accounting: FeeAccounting, discovery: Discovery) {
  await fetchCurrentSwapCharges(accounting, discovery);
  await fetchTaxSettlements(accounting, discovery);
  await fetchCurrentRecaptures(accounting, discovery);
  await fetchModularCharges(accounting, discovery);
  await fetchLegacyRecaptures(accounting);
}

/** Match a root's earned fee with its Rules allocations in the same transaction, pool and currency. */
function allocationKey(log: { transactionHash: string }, poolId: string, currency: string) {
  return `${log.transactionHash}:${lowercase(poolId)}:${lowercase(currency)}`;
}

/** Read allocated swap charges, remove unsettled tax credits, and reconcile against the root's receipt. */
async function fetchCurrentSwapCharges(accounting: FeeAccounting, discovery: Discovery) {
  const { current, queues, roots, rules } = discovery;
  const allocated = await accounting.getLogs(rules, ABI.allocated);
  const earned = new Map<string, bigint>();
  for (const log of allocated) {
    const allocation = log.args;
    const pool = current.get(lowercase(allocation.id));
    if (!pool || pool.rules !== log.address || pool.quote !== lowercase(allocation.quote)) {
      throw new Error('Hookr: unauthenticated Rules allocation');
    }

    const gross =
      toBigInt(allocation.protocol) + toBigInt(allocation.royalty) + toBigInt(allocation.advisoryFee);
    earned.set(
      allocationKey(log, allocation.id, allocation.quote),
      (earned.get(allocationKey(log, allocation.id, allocation.quote)) ?? 0n) + gross,
    );
    // Tax queue credits become fees once, when the queue books their settlement, not at both stages.
    accounting.recordFees(
      'direct',
      allocation.quote,
      gross - (queues.has(lowercase(allocation.advisoryRecipient)) ? toBigInt(allocation.advisoryFee) : 0n),
      toBigInt(allocation.protocol),
    );
  }

  for (const log of await accounting.getLogs(
    rules,
    'event IntegratorPaid(bytes32 indexed id,address indexed quote,address indexed integrator,uint256 amount)',
  )) {
    const integratorPayment = log.args;
    const pool = current.get(lowercase(integratorPayment.id));
    if (!pool || pool.rules !== log.address || pool.quote !== lowercase(integratorPayment.quote)) {
      throw new Error('Hookr: unauthenticated integrator fee');
    }

    earned.set(
      allocationKey(log, integratorPayment.id, integratorPayment.quote),
      (earned.get(allocationKey(log, integratorPayment.id, integratorPayment.quote)) ?? 0n) +
        toBigInt(integratorPayment.amount),
    );
    accounting.recordFees('direct', integratorPayment.quote, toBigInt(integratorPayment.amount), 0n);
  }

  const rootEarned = new Map<string, bigint>();

  for (const log of await accounting.getLogs(
    roots,
    'event HookFee(bytes32 indexed id,address indexed quote,uint256 earned,uint256 refund,uint256 burned)',
  )) {
    const hookFee = log.args;
    const pool = current.get(lowercase(hookFee.id));
    if (!pool || pool.root !== log.address) {
      throw new Error('Hookr: unregistered hook charge');
    }

    rootEarned.set(
      allocationKey(log, hookFee.id, hookFee.quote),
      (rootEarned.get(allocationKey(log, hookFee.id, hookFee.quote)) ?? 0n) + toBigInt(hookFee.earned),
    );
    // Other launched subjects are supplier allocations; HOOKR itself is holder income.
    accounting.recordSubjectBurn(pool.subject, toBigInt(hookFee.burned));
  }

  for (const feeKey of new Set([...rootEarned.keys(), ...earned.keys()])) {
    if ((rootEarned.get(feeKey) ?? 0n) !== (earned.get(feeKey) ?? 0n)) {
      throw new Error(`Hookr: root/Rules fee mismatch ${feeKey}`);
    }
  }
}

/** Recognize directional taxes at queue settlement; the earlier advisory credit is excluded above. */
async function fetchTaxSettlements(accounting: FeeAccounting, discovery: Discovery) {
  const { queues } = discovery;
  for (const eventAbi of [
    'event Settled(uint256 income,uint256 protocolAmount,uint256 creatorAmount)',
    'event ClaimPaidAsClaims(uint256 claim,address indexed protocolTo,uint256 protocolAmount,' +
      'address indexed creatorRecipient,uint256 creatorAmount)',
  ]) {
    for (const log of await accounting.getLogs([...queues.keys()], eventAbi)) {
      const settlement = log.args;
      const gross = toBigInt(settlement.income ?? settlement.claim);
      if (gross !== toBigInt(settlement.protocolAmount) + toBigInt(settlement.creatorAmount)) {
        throw new Error('Hookr: tax settlement mismatch');
      }

      accounting.recordFees('tax', queues.get(log.address)!, gross, toBigInt(settlement.protocolAmount));
    }
  }
}

/** Include the authenticated recapture distribution and the executor's separately retained share. */
async function fetchCurrentRecaptures(accounting: FeeAccounting, discovery: Discovery) {
  const { current, roots, rules } = discovery;
  const corrections = await accounting.getLogs(roots, ABI.correction);
  const splits = await accounting.getLogs(rules, ABI.recapture);
  const grouped = new Map<
    string,
    {
      pushed: bigint;
      distributed: bigint;
    }
  >();
  const expectedPartners = new Set<string>();

  for (const log of corrections) {
    const correction = log.args;
    const pool = current.get(lowercase(correction.id));
    if (!pool || pool.root !== log.address) {
      throw new Error('Hookr: unauthenticated correction');
    }

    if (toBigInt(correction.pushed) > 0n) {
      if (!pool.executor || !EXECUTORS.includes(pool.executor)) {
        throw new Error('Hookr: unreviewed recapture executor');
      }

      expectedPartners.add(`${log.transactionHash}:${lowercase(correction.id)}`);
    }

    const correctionKey = allocationKey(log, correction.id, correction.currency);
    const row = grouped.get(correctionKey) ?? { pushed: 0n, distributed: 0n };
    row.pushed += toBigInt(correction.pushed);
    grouped.set(correctionKey, row);
  }

  for (const log of splits) {
    const split = log.args;
    const pool = current.get(lowercase(split.id));
    if (!pool || pool.rules !== log.address) {
      throw new Error('Hookr: unauthenticated recapture split');
    }

    const total =
      toBigInt(split.protocol) + toBigInt(split.traderAmount) + toBigInt(split.lp) + toBigInt(split.pot);
    const splitKey = allocationKey(log, split.id, split.currency);
    const row = grouped.get(splitKey) ?? { pushed: 0n, distributed: 0n };
    row.distributed += total;
    grouped.set(splitKey, row);
    accounting.recordFees('recapture', split.currency, total, toBigInt(split.protocol));
  }

  for (const row of grouped.values()) {
    if (row.pushed !== row.distributed) {
      throw new Error('Hookr: recapture push/distribution mismatch');
    }
  }

  const authenticated = new Set(corrections.map(log => `${log.transactionHash}:${lowercase(log.args.id)}`));
  const observedPartners = new Set<string>();

  // The executor's retained leg can use a DIFFERENT currency from its Hookr push.
  // Unpublished executor source: same confirmed ABI as fees/what-the-hook.ts, authenticated by root receipts.
  for (const log of await accounting.getLogs(EXECUTORS, ABI.partner)) {
    const accrual = log.args;
    const partnerKey = `${log.transactionHash}:${lowercase(accrual.poolId)}`;
    if (!authenticated.has(partnerKey)) {
      continue;
    }

    if (current.get(lowercase(accrual.poolId))?.executor !== log.address) {
      throw new Error('Hookr: executor differs from frozen pool lane');
    }

    observedPartners.add(partnerKey);
    accounting.recordFees('recapture', accrual.currency, toBigInt(accrual.treasuryAmount), 0n);
  }

  for (const partnerKey of expectedPartners) {
    if (!observedPartners.has(partnerKey)) {
      throw new Error('Hookr: recapture lacks its executor payout record');
    }
  }
}

/** Older modular pools book protocol and supplier quote charges separately from subject-token burns. */
async function fetchModularCharges(accounting: FeeAccounting, discovery: Discovery) {
  const { modular } = discovery;
  for (const log of await accounting.getLogs(
    [CONTRACT.mechanics],
    'event ProtocolShareAccrued(bytes32 indexed poolId,uint8 indexed stream,uint256 amount)',
  )) {
    const pool = modular.get(lowercase(log.args.poolId));
    if (!pool) {
      throw new Error(`Hookr: unresolved modular fee pool ${log.args.poolId}; discovered ${modular.size}`);
    }

    accounting.recordFees('v2', pool.quote, toBigInt(log.args.amount), toBigInt(log.args.amount));
  }

  for (const log of await accounting.getLogs(
    [CONTRACT.mechanics],
    'event HookFeesAccrued(bytes32 indexed poolId,uint256 burnWei,uint256 lpWei,uint256 potWeiAdded,' +
      'uint256 royaltyWei,address royaltyTo)',
  )) {
    const accrual = log.args;
    const pool = modular.get(lowercase(accrual.poolId));
    if (!pool) {
      throw new Error('Hookr: unresolved modular supplier pool');
    }

    // The verified module always emits burnWei=0: the net burn is charged in SUBJECT,
    // while its protocol share is charged separately in quote (ProtocolShareAccrued).
    if (toBigInt(accrual.burnWei) !== 0n) {
      throw new Error('Hookr: unreviewed modular quote-burn charge');
    }

    accounting.recordFees(
      'v2',
      pool.quote,
      toBigInt(accrual.lpWei) + toBigInt(accrual.potWeiAdded) + toBigInt(accrual.royaltyWei),
      0n,
    );
  }

  for (const log of await accounting.getLogs(
    [CONTRACT.mechanics],
    'event AutoBurn(bytes32 indexed poolId,uint256 tokensBurned)',
  )) {
    const pool = modular.get(lowercase(log.args.poolId));
    if (!pool) {
      throw new Error('Hookr: unresolved modular subject burn');
    }

    accounting.recordSubjectBurn(pool.subject, toBigInt(log.args.tokensBurned));
  }
}

/** Pair each historical root receipt with its preceding, unused executor split; never match by tx alone. */
async function fetchLegacyRecaptures(accounting: FeeAccounting) {
  const oldSplits = await accounting.getLogs(LEGACY_EXECUTORS, ABI.oldPartner);
  const consumed = new Set<any>();

  for (const log of await accounting.getLogs(
    OLD_ROOTS,
    'event CorrectionAttemptSucceeded(bytes32 indexed poolId,uint8 indexed phase,bytes32 indexed planDigest,' +
      'uint256 realizedProfitQuote)',
  )) {
    const correction = log.args;
    if (toBigInt(correction.realizedProfitQuote) === 0n) {
      continue;
    }

    const match = oldSplits
      .filter(
        split =>
          split.transactionHash === log.transactionHash &&
          compareLogPosition(split, log) < 0 &&
          !consumed.has(split) &&
          toBigInt(split.args.totalProfit) === toBigInt(correction.realizedProfitQuote),
      )
      .pop();
    if (!match) {
      throw new Error('Hookr: historical correction lacks a settled executor payout');
    }

    consumed.add(match);
    const split = match.args;
    const total = toBigInt(split.totalProfit);
    const kept = toBigInt(split.hookrProtocolAmount);
    if (
      total !==
      kept +
        toBigInt(split.traderAmount) +
        toBigInt(split.creatorAmount) +
        toBigInt(split.triggerPoolAmount) +
        toBigInt(split.wthProtocolAmount)
    ) {
      throw new Error('Hookr: historical recapture split mismatch');
    }

    accounting.recordFees('recapture', split.profitCurrency, total, kept);
  }
}

/** Attribute only Hookr's realized fee uplift to LPs; replay Uniswap protocol-fee changes in log order. */
export async function fetchAdditionalLpFees(accounting: FeeAccounting, pools: Map<string, Pool>) {
  if (!pools.size) {
    return;
  }

  const ids = [...pools.keys()];
  // Indexed pool ids restrict the singleton PoolManager query to Hookr's authenticated pools.
  const topics = (abi: string) => [eventTopic(abi), ids] as any;
  const swaps = await accounting.getLogs([CONTRACT.poolManager], ABI.swap, { topics: topics(ABI.swap) });
  if (!swaps.length) {
    return;
  }

  const active = [...new Set<string>(swaps.map(log => lowercase(log.args.id)))];
  const existing = active.filter(id => pools.get(id)!.block < accounting.fromBlock);
  const slots = existing.length
    ? await accounting.openingApi.multiCall({
        target: CONTRACT.stateView,
        abi: 'function getSlot0(bytes32) view returns(uint160 sqrtPriceX96,int24 tick,uint24 protocolFee,uint24 lpFee)',
        calls: existing,
      })
    : [];
  const protocol = new Map(existing.map((id, index) => [id, toBigInt(slots[index].protocolFee)]));

  // Newly initialized pools start at zero unless a ProtocolFeeUpdated event sets another value.
  for (const id of active) {
    if (!protocol.has(id)) {
      protocol.set(id, 0n);
    }
  }

  const updated = 'event ProtocolFeeUpdated(bytes32 indexed id,uint24 protocolFee)';
  const changes = await accounting.getLogs([CONTRACT.poolManager], updated, { topics: topics(updated) });
  const sequence = [
    ...swaps.map(log => ({ log, isSwap: true })),
    ...changes.map(log => ({ log, isSwap: false })),
  ].sort((firstEvent, secondEvent) => compareLogPosition(firstEvent.log, secondEvent.log));
  const FEE_PIPS = 1_000_000n;
  // Uniswap v4 fee units, 1 pip = 1e-6.
  for (const { log, isSwap } of sequence) {
    const swap = log.args;
    const id = lowercase(swap.id);
    if (!isSwap) {
      protocol.set(id, toBigInt(swap.protocolFee));
      continue;
    }

    const pool = pools.get(id)!;
    const zeroForOne = toBigInt(swap.amount0) < 0n;
    const input = -(zeroForOne ? toBigInt(swap.amount0) : toBigInt(swap.amount1));
    if (input <= 0n) {
      continue;
    }

    const packedProtocolFee = protocol.get(id)!;
    // Uniswap packs two 12-bit directional protocol fees into one uint24.
    const directionalProtocolFee = zeroForOne ? packedProtocolFee & 0xfffn : packedProtocolFee >> 12n;
    const ordinaryFee =
      directionalProtocolFee + pool.baseFee - (directionalProtocolFee * pool.baseFee) / FEE_PIPS;
    const uplift = toBigInt(swap.fee) - ordinaryFee;
    // The historical WTH kernel waives LP fees on its internal correction legs
    // (HookrSwapKernelV5Wth.beforeSwap returns only OVERRIDE_FEE_FLAG). A discounted
    // or waived base fee is not a negative Hookr surcharge.
    if (uplift <= 0n) {
      continue;
    }

    // Attribute the realized Swap input using its realized fee uplift, never an assumed tier.
    // Swap-step rounding can differ by raw token units; ordinary Uniswap base fees are excluded.
    const amount = (input * uplift) / FEE_PIPS;
    const [currency0, currency1] = [pool.subject, pool.quote].sort();
    accounting.recordFees('lp', zeroForOne ? currency0 : currency1, amount, 0n);
  }
}
