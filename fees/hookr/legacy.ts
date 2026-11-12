import { FeeAccounting, toBigInt, lowercase, compareLogPosition, HookrLog } from './common';
import { CONTRACT, LEGACY, LegacyLaunchpad, NATIVE } from './config';

type LegacyEvent = {
  log: HookrLog;
  kind: 'price' | 'launch' | 'buy' | 'sell' | 'graduate' | 'lp' | 'withdraw';
};

/** Reconstruct historical launchpad fees and separately book the dedicated flywheel charge. */
export async function fetchLegacyFees(accounting: FeeAccounting) {
  const launchpads = LEGACY.filter(launchpad => launchpad.block <= accounting.toBlock);
  if (!launchpads.length) return;
  await fetchLaunchpadFees(accounting, launchpads);
  for (const log of await accounting.getLogs(
    [CONTRACT.legacyHook],
    'event FlywheelFeeAccrued(bytes32 indexed poolId,uint256 amountWei)',
  )) {
    const amount = toBigInt(log.args.amountWei);
    accounting.recordFees('flywheel', NATIVE, amount, amount);
    // The verified hook irrevocably credits this fee to the dedicated HOOKR buyback burner.
    accounting.recordBurnFunding(NATIVE, amount);
  }
}

/** Replay launch prices and curve reserves; use the protocol counter for the actual retained share. */
async function fetchLaunchpadFees(accounting: FeeAccounting, launchpads: LegacyLaunchpad[]) {
  const auctionLaunchpad = LEGACY.find(launchpad => launchpad.generation === 5)!;
  const targets = launchpads.map(launchpad => launchpad.address);
  const events = await getLegacyEvents(accounting, launchpads);
  const openingContracts = launchpads.filter(launchpad => launchpad.block < accounting.fromBlock);
  const openingCounters = openingContracts.length
    ? await accounting.openingApi.multiCall({
        abi: 'uint256:protocolFeesWei',
        calls: openingContracts.map(launchpad => launchpad.address),
      })
    : [];
  const closingCounters = await accounting.options.toApi.multiCall({
    abi: 'uint256:protocolFeesWei',
    calls: targets,
  });
  const openingCreationFees = openingContracts.length
    ? await accounting.openingApi.multiCall({
        abi: 'function creationFeeWei() view returns(uint96)',
        calls: openingContracts.map(launchpad => launchpad.address),
      })
    : [];
  const openingProtocolFees = new Map(
    openingContracts.map((launchpad, index) => [launchpad.address, toBigInt(openingCounters[index])]),
  );
  const creationFees = new Map(
    openingContracts.map((launchpad, index) => [launchpad.address, toBigInt(openingCreationFees[index])]),
  );

  // All three verified constructors initialize creationFeeWei to 0.0002 ETH.
  // https://github.com/Hookr-fun/hookr-contracts/tree/main/legacy
  for (const launchpad of launchpads) {
    if (!creationFees.has(launchpad.address)) {
      creationFees.set(launchpad.address, 200_000_000_000_000n);
    }
  }

  const curveReserves = await readOpeningReserves(accounting, launchpads, events);

  const quoteTokens = [
    ...new Set<string>(
      events
        .filter(event => event.kind === 'lp' && event.log.address === auctionLaunchpad.address)
        .map(event => lowercase(event.log.args.token)),
    ),
  ];
  const quoteTerms = quoteTokens.length
    ? await accounting.options.toApi.multiCall({
        target: auctionLaunchpad.address,
        abi: auctionLaunchpad.getLaunch,
        calls: quoteTokens,
      })
    : [];
  const auctionQuotes = new Map(
    quoteTokens.map((token, index) => [
      token,
      Number(quoteTerms[index].quote) === 1 ? CONTRACT.hookr : NATIVE,
    ]),
  );
  const grossByLaunchpad = new Map<string, bigint>();
  const withdrawalsByLaunchpad = new Map<string, bigint>();
  const addGrossFees = (address: string, amount: bigint) => {
    if (amount < 0n) {
      throw new Error('Hookr: negative reconstructed legacy fee');
    }

    grossByLaunchpad.set(address, (grossByLaunchpad.get(address) ?? 0n) + amount);
  };

  for (const { log, kind } of events) {
    const event = log.args;
    const key = `${log.address}:${lowercase(event.token)}`;
    if (kind === 'price') {
      creationFees.set(log.address, toBigInt(event.feeWei));
    }

    if (kind === 'launch') {
      addGrossFees(log.address, creationFees.get(log.address)!);
      if (!curveReserves.has(key)) {
        curveReserves.set(key, 0n);
      }
    }

    // The verified bonding curve charges 1% of gross buy input, with integer truncation.
    if (kind === 'buy') {
      addGrossFees(log.address, toBigInt(event.ethIn) / 100n);
      curveReserves.set(key, toBigInt(event.reserveWei));
    }

    if (kind === 'sell' || kind === 'graduate') {
      const reserve = curveReserves.get(key);
      if (reserve === undefined) {
        throw new Error('Hookr: missing opening curve reserve');
      }

      // The emitted output is net of fees: the reserve not paid out or carried forward is the charge.
      const remainingReserve = kind === 'sell' ? toBigInt(event.reserveWei) : 0n;
      const payout = kind === 'sell' ? toBigInt(event.ethOut) : toBigInt(event.ethLiquidity);
      addGrossFees(log.address, reserve - remainingReserve - payout);
      curveReserves.set(key, remainingReserve);
    }

    if (kind === 'withdraw') {
      withdrawalsByLaunchpad.set(
        log.address,
        (withdrawalsByLaunchpad.get(log.address) ?? 0n) + toBigInt(event.amountWei),
      );
    }

    if (kind === 'lp') {
      const quote =
        log.address === auctionLaunchpad.address ? auctionQuotes.get(lowercase(event.token))! : NATIVE;
      if (quote === NATIVE) {
        addGrossFees(log.address, toBigInt(event.ethAmount));
      } else {
        accounting.recordFees('legacy', quote, toBigInt(event.ethAmount), 0n);
      }
      // HOOKR-quoted legacy pools credit the entire quote leg to creators.
      accounting.recordSubjectBurn(event.token, toBigInt(event.tokensBurned));
    }
  }

  launchpads.forEach((launchpad, index) => {
    // Counter delta plus withdrawals is exact even when guard withholding changes the LP split.
    const revenue =
      toBigInt(closingCounters[index]) -
      (openingProtocolFees.get(launchpad.address) ?? 0n) +
      (withdrawalsByLaunchpad.get(launchpad.address) ?? 0n);
    accounting.recordFees('legacy', NATIVE, grossByLaunchpad.get(launchpad.address) ?? 0n, revenue);
  });
}

/** Merge generation-specific event ABIs before replaying changes in on-chain order. */
async function getLegacyEvents(accounting: FeeAccounting, launchpads: LegacyLaunchpad[]) {
  const targets = launchpads.map(launchpad => launchpad.address);
  const events: LegacyEvent[] = [];
  const collect = async (addresses: string[], abi: string, kind: LegacyEvent['kind']) => {
    for (const log of await accounting.getLogs(addresses, abi)) {
      events.push({ log, kind });
    }
  };
  await collect(targets, 'event CreationFeeSet(uint96 feeWei)', 'price');

  for (const launchpad of launchpads) {
    await collect([launchpad.address], launchpad.launched, 'launch');
  }

  const curves = launchpads.filter(launchpad => launchpad.generation < 5).map(launchpad => launchpad.address);
  await collect(
    curves,
    'event CurveBuy(address indexed token,address indexed buyer,uint256 ethIn,uint256 tokensOut,' +
      'uint96 reserveWei,uint128 soldTokens)',
    'buy',
  );
  await collect(
    curves,
    'event CurveSell(address indexed token,address indexed seller,uint256 tokensIn,uint256 ethOut,' +
      'uint96 reserveWei,uint128 soldTokens)',
    'sell',
  );
  await collect(
    curves,
    'event Graduated(address indexed token,bytes32 indexed poolId,uint160 sqrtPriceX96,uint256 ethLiquidity,' +
      'uint256 tokenLiquidity,uint256 tokensBurned)',
    'graduate',
  );
  await collect(
    targets,
    'event PoolFeesCollected(address indexed token,uint256 ethAmount,uint256 tokensBurned)',
    'lp',
  );
  await collect(targets, 'event ProtocolFeesWithdrawn(address indexed to,uint256 amountWei)', 'withdraw');
  const instantLaunchpad = launchpads.find(launchpad => launchpad.generation === 4);
  const instantLaunches = instantLaunchpad
    ? await accounting.getLogs(
        [instantLaunchpad.address],
        'event InstantLaunched(address indexed token,bytes32 indexed poolId,uint16 poolSupplyBps,' +
          'uint96 openPriceWei,uint256 ethInPool)',
      )
    : [];
  const launchKey = (log: HookrLog) =>
    `${log.transactionHash}:${log.address}:${lowercase(log.args.token)}`;
  const instantLaunchKeys = new Set(instantLaunches.map(launchKey));
  events.sort((firstEvent, secondEvent) => compareLogPosition(firstEvent.log, secondEvent.log));
  // Generation 4's shared _openPool emits Graduated for instant launches too. Their ETH seed is
  // creator principal, and unused ETH is refunded; neither is a curve reserve or a fee.
  // Verified source: https://robin.etherscan.io/address/0x5ce779d23d2e99d322004f203813389b6a426e3b#code
  return events.filter(({ log, kind }) => kind !== 'graduate' || !instantLaunchKeys.has(launchKey(log)));
}

/** Only a sell or graduation needs the preceding reserve; buys already emit their closing reserve. */
async function readOpeningReserves(
  accounting: FeeAccounting,
  launchpads: LegacyLaunchpad[],
  events: LegacyEvent[],
) {
  const reserves = new Map<string, bigint>();
  // Different generations return different structs; batch each generation's historical reserves.
  for (const launchpad of launchpads.filter(launchpad => launchpad.block < accounting.fromBlock)) {
    const tokens = [
      ...new Set(
        events
          .filter(
            ({ log, kind }) => log.address === launchpad.address && (kind === 'sell' || kind === 'graduate'),
          )
          .map(({ log }) => lowercase(log.args.token)),
      ),
    ];
    if (!tokens.length) continue;
    const launches = await accounting.openingApi.multiCall({
      target: launchpad.address,
      abi: launchpad.getLaunch,
      calls: tokens,
    });
    tokens.forEach((token, index) =>
      reserves.set(`${launchpad.address}:${token}`, toBigInt(launches[index].reserveWei)),
    );
  }
  return reserves;
}
