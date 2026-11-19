import { FetchOptions, SimpleAdapter } from '../adapters/types';
import { CHAIN } from '../helpers/chains';
import { EventLog, events, FeePolicy, logIndex, logOrder, lower, multicallOptions, nativeToken, period, policyTuple, splitFee } from '../helpers/genius-fun';

// Loong is a fork of Genius.fun v4.2: the curve, hook and FoundationFeeMath fee split are ABI- and
// math-identical, so the Genius helper's event ABIs and splitFee() are reused. Only the addresses differ.
// Deployment manifest: https://loongfamily.app/contracts/manifest.json
// https://bscscan.com/address/0x60dDcE270E1B9A8325daD4A39dB1442598b26B3A (LoongLaunchFactory)
// https://bscscan.com/address/0xD795A9815D68548aF2Bafc9862f3AdFF3DFb36ec (LoongMemeHook)
const factory = '0x60dDcE270E1B9A8325daD4A39dB1442598b26B3A';
const factoryFromBlock = 124024834;
const hook = '0xD795A9815D68548aF2Bafc9862f3AdFF3DFb36ec';
// Fixed PancakeSwap Infinity CL pool manager that graduated Loong pools trade in.
const poolManager = '0xa0FfB9c1CE1Fe56963B0321B32E7A0302114058b';
// $LOONG, the platform token. It is itself a Loong launch (graduated pool), and is the token the
// $LOONG buyback-burner buys and sends to 0x...dEaD: LoongBuybackBurner(0xEc7e9274b5dD5cC85cF5e35786a6a9FdC2a4c165).loong()
const loongToken = '0x7b567d44f79e14d3a0f00fd9690e3742f04a9999';
const poolAbi = 'function launches(bytes32) view returns (bool registered,bool memecoinIsCurrency0,address memecoin,address quoteToken,address creator,address buybackCreatorRecipient,address protocolFeeRecipient,uint16 creatorTaxBps,uint16 protocolFeeShareBps,uint16 buybackBurnBps,uint16 hookFeeBps,uint16 maxInternalPriceImpactBps,bool buybackEnabled)';

// Fee policy frozen per launch (curve.foundationFeePolicy() / hook.poolFoundationFeePolicy()); on mainnet every
// launch reads (destination 10, platform 10, creator 70, buyback 10) bps of a 100 bps fee, i.e. of each trade:
//   destination 0.10% -> the $LOONG vault (0xFd89650CCC6f15403996014F6f10382F1f67A485), whose only controller is the
//                        $LOONG buyback-burner: $LOONG buyback and burn (holders revenue)
//   platform    0.10% -> Loong protocol fee recipient (protocol revenue)
//   creator     0.70% -> the coin's creator fee recipient (supply side)
//   buyback     0.10% -> buyback and burn of the traded coin itself (supply side; holders revenue only for $LOONG)
// Loong's factory forces toFoundation = true on every launch (LoongLaunchFactory: setFoundationDestination(true));
// it is still read so a false value would route the destination share to the creator exactly like the contracts.
function feeParts(fee: bigint, tax: bigint, policy: FeePolicy, quoteAmount = 1n, feeCurrencyAmount = 1n) {
  if (quoteAmount <= 0n || feeCurrencyAmount <= 0n) throw new Error('Loong: invalid swap valuation');
  const raw = splitFee(fee, tax, policy);
  const convert = (value: bigint) => value * quoteAmount / feeCurrencyAmount;
  const total = convert(fee + tax);
  const destination = convert(raw.destination);
  const platform = convert(raw.platform);
  const buyback = convert(raw.buyback);
  // Rounding residue belongs to the creator, as in FoundationFeeMath.split.
  return { total, destination, platform, buyback, creator: total - destination - platform - buyback };
}

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const result = () => ({ dailyVolume, dailyFees, dailyRevenue, dailyProtocolRevenue, dailyHoldersRevenue, dailySupplySideRevenue });

  const range = await period(options);
  if (range.fromBlock > range.toBlock) return result();

  const addTradingFee = (quoteToken: string, memecoin: string, source: 'Curve' | 'Hook', parts: ReturnType<typeof feeParts>, toFoundation: boolean) => {
    const isLoong = lower(memecoin) === loongToken;
    dailyFees.add(quoteToken, parts.total, `${source} Trading Fees`);
    dailyRevenue.add(quoteToken, parts.platform, `${source} Fees To Loong`);
    dailyProtocolRevenue.add(quoteToken, parts.platform, `${source} Fees To Loong`);
    const loongBuyback = (toFoundation ? parts.destination : 0n) + (isLoong ? parts.buyback : 0n);
    dailyRevenue.add(quoteToken, loongBuyback, `${source} Fees For LOONG Buyback And Burn`);
    dailyHoldersRevenue.add(quoteToken, loongBuyback, `${source} Fees For LOONG Buyback And Burn`);
    dailySupplySideRevenue.add(quoteToken, parts.creator + (toFoundation ? 0n : parts.destination), `${source} Fees To Creators`);
    // Buybacks of individual launched meme tokens are supply side, not holders revenue.
    dailySupplySideRevenue.add(quoteToken, isLoong ? 0n : parts.buyback, `${source} Fees For Meme Buybacks`);
  };

  // ---- Bonding curves (pre-graduation) ----
  const launches: EventLog[] = await options.getLogs({
    target: factory, eventAbi: events.launch, fromBlock: factoryFromBlock, toBlock: range.toBlock,
    entireLog: true, parseLog: true, cacheInCloud: true,
  });
  const byCurve = new Map(launches.map(log => [lower(log.args.curve), log]));
  const curveTargets = [...byCurve.keys()];
  const readTrades = async (eventAbi: string) => {
    if (!curveTargets.length) return [] as EventLog[];
    const logs: EventLog[] = await options.getLogs({ targets: curveTargets, eventAbi, ...range, entireLog: true, parseLog: true });
    return logs.filter(log => byCurve.has(lower(log.address)));
  };
  const buys = await readTrades(events.buy);
  const sells = await readTrades(events.sell);

  const curves = [...new Set([...buys, ...sells].map(log => lower(log.address)))];
  const curvePolicies: FeePolicy[] = await options.api.multiCall({ ...multicallOptions, abi: `function foundationFeePolicy() view returns (${policyTuple})`, calls: curves });
  const curveToFoundation: boolean[] = await options.api.multiCall({ ...multicallOptions, abi: 'bool:toFoundation', calls: curves });
  const policyByCurve = new Map(curves.map((curve, index) => [curve, { policy: curvePolicies[index], toFoundation: curveToFoundation[index] }]));

  for (const log of buys) {
    const launch = byCurve.get(lower(log.address))!;
    // quoteIn is the accepted gross input (fee, creator tax and snipe tax included), excluding any refunded final fill.
    dailyVolume.add(launch.args.pairToken, log.args.quoteIn);
  }
  for (const log of sells) {
    const launch = byCurve.get(lower(log.address))!;
    // quoteOut is net of fee and tax; restore the gross quote leg.
    dailyVolume.add(launch.args.pairToken, BigInt(log.args.quoteOut) + BigInt(log.args.fee) + BigInt(log.args.tax));
  }
  for (const log of [...buys, ...sells]) {
    const launch = byCurve.get(lower(log.address))!;
    const { policy, toFoundation } = policyByCurve.get(lower(log.address))!;
    // CurveBuy.fee already includes the launch-window snipe tax; SnipeTaxCharged is informational only.
    addTradingFee(launch.args.pairToken, launch.args.token, 'Curve', feeParts(BigInt(log.args.fee), BigInt(log.args.tax), policy), toFoundation);
  }

  // ---- Token creation fee (currently 0 BNB, paid to the protocol fee recipient) ----
  const periodLaunches = launches.filter(log => log.blockNumber >= range.fromBlock);
  if (periodLaunches.length) {
    const updates: EventLog[] = await options.getLogs({ target: factory, eventAbi: events.launchFee, ...range, entireLog: true, parseLog: true });
    let activeFee = BigInt(await options.api.call({ target: factory, abi: 'uint256:launchFee', block: Math.max(factoryFromBlock, range.fromBlock - 1) }));
    let creationFees = 0n;
    const rows = [...updates.map(log => ({ log, update: true })), ...periodLaunches.map(log => ({ log, update: false }))];
    rows.sort((a, b) => logOrder(a.log, b.log));
    for (const { log, update } of rows) {
      if (update) activeFee = BigInt(log.args.launchFee);
      else creationFees += activeFee;
    }
    dailyFees.add(nativeToken, creationFees, 'Token Creation Fees');
    dailyRevenue.add(nativeToken, creationFees, 'Token Creation Fees To Loong');
    dailyProtocolRevenue.add(nativeToken, creationFees, 'Token Creation Fees To Loong');
  }

  // ---- Graduated PancakeSwap Infinity pools (Loong hook fees; no pool volume, see methodology) ----
  const hookFees: EventLog[] = await options.getLogs({ target: hook, eventAbi: events.hookFee, ...range, entireLog: true, parseLog: true });
  const poolIds = [...new Set(hookFees.map(log => lower(log.args.poolId)))];
  // Registration and fee policy are frozen per pool, so current reads also describe historical accrual.
  const poolCalls = poolIds.map(id => ({ target: hook, params: [id] }));
  const poolInfo = await options.api.multiCall({ ...multicallOptions, abi: poolAbi, calls: poolCalls });
  const poolPolicies = await options.api.multiCall({ ...multicallOptions, abi: `function poolFoundationFeePolicy(bytes32) view returns (${policyTuple},bool)`, calls: poolCalls });
  const pools = new Map(poolIds.map((id, index) => [id, { info: poolInfo[index], policy: poolPolicies[index][0], toFoundation: poolPolicies[index][1] }]));

  // The hook takes its fee in the swap's unspecified currency; when that is the memecoin, value it at the
  // originating swap's quote/meme execution ratio (same approach as the Genius.fun adapter).
  const memeFeeLogs = hookFees.filter(log => lower(log.args.currency) !== lower(pools.get(lower(log.args.poolId))!.info.quoteToken));
  const swapsByTransaction = new Map<string, EventLog[]>();
  if (memeFeeLogs.length) {
    const swapRange = memeFeeLogs.reduce(({ fromBlock, toBlock }, log) => ({
      fromBlock: Math.min(fromBlock, log.blockNumber), toBlock: Math.max(toBlock, log.blockNumber),
    }), { fromBlock: range.toBlock, toBlock: range.fromBlock });
    // SDK getEventLogs accepts extraTopics and options.getLogs forwards it (FetchGetLogsOptions omits the field).
    // The first indexed Swap field is the pool id, so this requests only the affected Loong pools.
    const poolFilter = { extraTopics: [[...new Set(memeFeeLogs.map(log => log.args.poolId))]] };
    const swaps: EventLog[] = await options.getLogs({ target: poolManager, eventAbi: events.swap, ...poolFilter, ...swapRange, entireLog: true, parseLog: true });
    for (const swap of swaps.sort(logOrder)) {
      const rows = swapsByTransaction.get(swap.transactionHash) ?? [];
      rows.push(swap);
      swapsByTransaction.set(swap.transactionHash, rows);
    }
  }

  for (const log of hookFees.sort(logOrder)) {
    const { info, policy, toFoundation } = pools.get(lower(log.args.poolId))!;
    let quoteAmount = 1n;
    let feeCurrencyAmount = 1n;
    if (lower(log.args.currency) !== lower(info.quoteToken)) {
      if (lower(log.args.currency) !== lower(info.memecoin)) throw new Error('Loong: unexpected hook fee currency');
      // Infinity emits Swap before afterSwap: match the nearest preceding Swap of the same pool in the same tx.
      const swaps = swapsByTransaction.get(log.transactionHash) ?? [];
      const match = swaps.filter(swap => logIndex(swap) < logIndex(log) && lower(swap.args.id) === lower(log.args.poolId)).pop();
      if (!match) throw new Error(`Loong: no originating Swap for hook fee in ${log.transactionHash}`);
      const abs = (value: bigint) => value < 0n ? -value : value;
      quoteAmount = abs(BigInt(info.memecoinIsCurrency0 ? match.args.amount1 : match.args.amount0));
      feeCurrencyAmount = abs(BigInt(info.memecoinIsCurrency0 ? match.args.amount0 : match.args.amount1));
      swaps.splice(swaps.indexOf(match), 1);
    }
    addTradingFee(info.quoteToken, info.memecoin, 'Hook', feeParts(BigInt(log.args.feeAmount), BigInt(log.args.taxAmount), policy, quoteAmount, feeCurrencyAmount), toFoundation);
  }

  // Fee sweeps, escrow credits/claims and executed buybacks only settle fees already accrued above; counting them would double count.
  return result();
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  chains: [CHAIN.BSC],
  start: '2026-09-25',
  fetch,
  methodology: {
    Volume: 'Gross quote-asset volume on Loong bonding curves (buys at quoteIn, sells at quoteOut + fee + tax). Trading after graduation happens in PancakeSwap Infinity pools and is excluded here, as it belongs to PancakeSwap.',
    Fees: 'A 1% fee on every Loong trade, on the bonding curve and in graduated PancakeSwap Infinity pools (charged by the Loong hook), plus the launch-window anti-snipe tax (starts at 99% and decays to 0 over 3 seconds) and any token creation fee (currently 0).',
    Revenue: 'The 0.10% platform share and the 0.10% $LOONG buyback-and-burn share of every trade, plus token creation fees.',
    ProtocolRevenue: 'The 0.10% platform share of every trade, plus token creation fees.',
    HoldersRevenue: 'The 0.10% of every trade that funds $LOONG buybacks and burns; on the $LOONG coin itself its own 0.10% coin buyback-and-burn share also buys $LOONG.',
    SupplySideRevenue: 'The 0.70% creator share of every trade, and the 0.10% used to buy back and burn the traded coin itself (except $LOONG).',
  },
  breakdownMethodology: {
    Fees: {
      'Curve Trading Fees': 'CurveBuy and CurveSell fee + tax: the 1% trading fee plus any launch-window snipe tax (CurveBuy.fee already includes it).',
      'Hook Trading Fees': 'HookFeeCollected feeAmount + taxAmount on graduated PancakeSwap Infinity pools, valued in the pool quote asset at the originating swap price when taken in the memecoin.',
      'Token Creation Fees': 'Factory launchFee paid per TokenLaunched (0 BNB since deployment), replaying LaunchFeeUpdated changes in log order.',
    },
    Revenue: {
      'Curve Fees To Loong': 'Platform share (10 of 100 bps) of bonding-curve fees.',
      'Hook Fees To Loong': 'Platform share (10 of 100 bps) of graduated-pool hook fees.',
      'Token Creation Fees To Loong': 'Token creation fees, paid to the protocol fee recipient.',
      'Curve Fees For LOONG Buyback And Burn': '$LOONG vault share (10 of 100 bps) of bonding-curve fees, plus the coin buyback share on the $LOONG curve itself.',
      'Hook Fees For LOONG Buyback And Burn': '$LOONG vault share (10 of 100 bps) of graduated-pool hook fees, plus the coin buyback share on the $LOONG pool itself.',
    },
    ProtocolRevenue: {
      'Curve Fees To Loong': 'Platform share (10 of 100 bps) of bonding-curve fees.',
      'Hook Fees To Loong': 'Platform share (10 of 100 bps) of graduated-pool hook fees.',
      'Token Creation Fees To Loong': 'Token creation fees, paid to the protocol fee recipient.',
    },
    HoldersRevenue: {
      'Curve Fees For LOONG Buyback And Burn': '$LOONG vault share (10 of 100 bps) of bonding-curve fees, which the LoongBuybackBurner converts into $LOONG and burns; plus the coin buyback share on the $LOONG curve itself.',
      'Hook Fees For LOONG Buyback And Burn': '$LOONG vault share (10 of 100 bps) of graduated-pool hook fees, which the LoongBuybackBurner converts into $LOONG and burns; plus the coin buyback share on the $LOONG pool itself.',
    },
    SupplySideRevenue: {
      'Curve Fees To Creators': 'Creator share (70 of 100 bps) of bonding-curve fees, including rounding residue and any creator tax.',
      'Hook Fees To Creators': 'Creator share (70 of 100 bps) of graduated-pool hook fees, including rounding residue and any creator tax.',
      'Curve Fees For Meme Buybacks': 'Share (10 of 100 bps) of bonding-curve fees used to buy back and burn that launched coin.',
      'Hook Fees For Meme Buybacks': 'Share (10 of 100 bps) of graduated-pool hook fees used to buy back and burn that launched coin.',
    },
  },
};

export default adapter;
