import { FetchOptions, SimpleAdapter } from '../adapters/types';
import { CHAIN } from '../helpers/chains';
import { deployments, EventLog, events, FeePolicy, getCurvePolicies, getCurveTrades, logIndex, logOrder, lower, multicallOptions, nativeToken, policyTuple, splitFee, start } from '../helpers/genius-fun';

// https://bscscan.com/address/0x9d60A14653b266F9D09E2137a5236F0C112eD42b#code
const alphaRegistry = '0x9d60A14653b266F9D09E2137a5236F0C112eD42b';
const alphaFromBlock = 122875664;
// Fixed PancakeSwap Infinity pool manager shared by both production stacks.
const poolManager = '0xa0FfB9c1CE1Fe56963B0321B32E7A0302114058b';
const poolAbi = 'function launches(bytes32) view returns (bool registered,bool memecoinIsCurrency0,address memecoin,address quoteToken,address creator,address buybackCreatorRecipient,address protocolFeeRecipient,uint16 creatorTaxBps,uint16 protocolFeeShareBps,uint16 buybackBurnBps,uint16 hookFeeBps,uint16 maxInternalPriceImpactBps,bool buybackEnabled)';

export function launchFeesInRange(initialFee: bigint, updates: EventLog[], launches: EventLog[]) {
  let activeFee = initialFee;
  let fees = 0n;
  const rows = [...updates.map(log => ({ log, update: true })), ...launches.map(log => ({ log, update: false }))];
  rows.sort((a, b) => logOrder(a.log, b.log));
  for (const { log, update } of rows) {
    if (update) activeFee = BigInt(log.args.launchFee);
    else fees += activeFee;
  }
  return fees;
}

export function quoteFeeParts(fee: bigint, tax: bigint, policy: FeePolicy, quoteAmount = 1n, feeCurrencyAmount = 1n) {
  if (quoteAmount <= 0n || feeCurrencyAmount <= 0n) throw new Error('Genius.fun: invalid swap valuation');
  const raw = splitFee(fee, tax, policy);
  const convert = (value: bigint) => value * quoteAmount / feeCurrencyAmount;
  const total = convert(fee + tax);
  const destination = convert(raw.destination);
  const platform = convert(raw.platform);
  const buyback = convert(raw.buyback);
  // Preserve the accounting identity after rounding to quote-asset base units.
  return { total, destination, platform, buyback, creator: total - destination - platform - buyback };
}

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const { range, launches, byCurve, buys, sells } = await getCurveTrades(options);
  if (range.fromBlock > range.toBlock) return { dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue.clone(), dailySupplySideRevenue };
  const curves = [...new Set([...buys, ...sells].map(log => lower(log.address)))];
  const curvePolicies = await getCurvePolicies(options, curves);

  const addTradingFee = (token: string, source: 'Curve' | 'Hook', parts: ReturnType<typeof quoteFeeParts>, toFoundation: boolean) => {
    dailyFees.add(token, parts.total, `${source} Trading Fees`);
    dailyRevenue.add(token, parts.platform, `${source} Fees To Genius`);
    dailySupplySideRevenue.add(token, parts.creator + (toFoundation ? 0n : parts.destination), `${source} Fees To Creators`);
    // The creator-selected destination allocation is separate from Genius's
    // platform cut, even when routed to the shared Foundation vault.
    dailySupplySideRevenue.add(token, toFoundation ? parts.destination : 0n, `${source} Fees To Foundation`);
    // These are buybacks of individual launched meme tokens, not a Genius
    // governance/value-accrual token. Classify their accrued funding as supply side.
    dailySupplySideRevenue.add(token, parts.buyback, `${source} Fees For Meme Buybacks`);
  };

  for (const log of [...buys, ...sells]) {
    const { policy, toFoundation } = curvePolicies.get(lower(log.address))!;
    addTradingFee(byCurve.get(lower(log.address))!.args.pairToken, 'Curve', quoteFeeParts(BigInt(log.args.fee), BigInt(log.args.tax), policy), toFoundation);
  }

  const factoriesWithLaunches = deployments.filter(deployment => launches.some(log => lower(log.address) === lower(deployment.factory) && log.blockNumber >= range.fromBlock));
  const launchFeeUpdates: EventLog[] = factoriesWithLaunches.length
    ? await options.getLogs({ targets: factoriesWithLaunches.map(deployment => deployment.factory), eventAbi: events.launchFee, ...range, entireLog: true, parseLog: true })
    : [];
  for (const deployment of factoriesWithLaunches) {
    const periodLaunches = launches.filter(log => lower(log.address) === lower(deployment.factory) && log.blockNumber >= range.fromBlock);
    const updates = launchFeeUpdates.filter(log => lower(log.address) === lower(deployment.factory));
    const feeBlock = Math.max(deployment.fromBlock, range.fromBlock - 1);
    const initialFee = BigInt(await options.api.call({ target: deployment.factory, abi: 'uint256:launchFee', block: feeBlock }));
    const fees = launchFeesInRange(initialFee, updates, periodLaunches);
    dailyFees.add(nativeToken, fees, 'Token Creation Fees');
    dailyRevenue.add(nativeToken, fees, 'Token Creation Fees To Genius');
  }

  const hooks = deployments.filter(deployment => deployment.fromBlock <= range.toBlock).map(deployment => deployment.hook);
  const hookFees: EventLog[] = hooks.length ? await options.getLogs({ targets: hooks, eventAbi: events.hookFee, ...range, entireLog: true, parseLog: true }) : [];
  const poolKeys = [...new Map(hookFees.map(log => {
    const key = `${lower(log.address)}:${lower(log.args.poolId)}`;
    return [key, { key, target: log.address, params: [log.args.poolId] }];
  })).values()];
  // Registration and fee policy are immutable per pool, so current reads also
  // describe historical accrual. Do not use the owner's current default policy.
  const poolInfo = await options.api.multiCall({ ...multicallOptions, abi: poolAbi, calls: poolKeys });
  const poolPolicies = await options.api.multiCall({ ...multicallOptions, abi: `function poolFoundationFeePolicy(bytes32) view returns (${policyTuple},bool)`, calls: poolKeys });
  const pools = new Map(poolKeys.map(({ key }, index) => [key, { info: poolInfo[index], policy: poolPolicies[index][0], toFoundation: poolPolicies[index][1] }]));

  const memeFeeLogs = hookFees.filter(log => {
    const { info } = pools.get(`${lower(log.address)}:${lower(log.args.poolId)}`)!;
    return lower(log.args.currency) !== lower(info.quoteToken);
  });
  const swapsByTransaction = new Map<string, EventLog[]>();
  if (memeFeeLogs.length) {
    const swapRange = memeFeeLogs.reduce(({ fromBlock, toBlock }, log) => ({
      fromBlock: Math.min(fromBlock, log.blockNumber), toBlock: Math.max(toBlock, log.blockNumber),
    }), { fromBlock: range.toBlock, toBlock: range.fromBlock });
    // SDK getEventLogs accepts extraTopics; options.getLogs forwards it. The
    // first indexed field is poolId, so this requests only affected Genius pools.
    const poolFilter = { extraTopics: [[...new Set(memeFeeLogs.map(log => log.args.poolId))]] };
    const swaps: EventLog[] = await options.getLogs({ target: poolManager, eventAbi: events.swap, ...poolFilter, ...swapRange, entireLog: true, parseLog: true });
    for (const swap of swaps.sort(logOrder)) {
      const rows = swapsByTransaction.get(swap.transactionHash) ?? [];
      rows.push(swap);
      swapsByTransaction.set(swap.transactionHash, rows);
    }
  }

  for (const log of hookFees.sort(logOrder)) {
    const { info, policy, toFoundation } = pools.get(`${lower(log.address)}:${lower(log.args.poolId)}`)!;
    let quoteAmount = 1n;
    let feeCurrencyAmount = 1n;
    if (lower(log.args.currency) !== lower(info.quoteToken)) {
      if (lower(log.args.currency) !== lower(info.memecoin)) throw new Error('Genius.fun: unexpected hook fee currency');
      // Infinity emits Swap before afterSwap. Match the nearest preceding swap
      // in the same transaction AND pool; batched swaps must remain distinct.
      const swaps = swapsByTransaction.get(log.transactionHash) ?? [];
      const match = swaps.filter(swap => logIndex(swap) < logIndex(log) && lower(swap.args.id) === lower(log.args.poolId)).pop();
      // A large pool-id filter can drop the originating Swap. Skip that fee rather than fail the day.
      if (!match) {
        continue;
      }
      const abs = (value: bigint) => value < 0n ? -value : value;
      quoteAmount = abs(BigInt(info.memecoinIsCurrency0 ? match.args.amount1 : match.args.amount0));
      feeCurrencyAmount = abs(BigInt(info.memecoinIsCurrency0 ? match.args.amount0 : match.args.amount1));
      swaps.splice(swaps.indexOf(match), 1);
    }
    // Meme-denominated fees are valued at this swap's gross execution price.
    // This is accrual valuation, not the proceeds of a later fee-conversion swap.
    addTradingFee(info.quoteToken, 'Hook', quoteFeeParts(BigInt(log.args.feeAmount), BigInt(log.args.taxAmount), policy, quoteAmount, feeCurrencyAmount), toFoundation);
  }

  if (range.toBlock >= alphaFromBlock) {
    const promotions = await options.getLogs({ target: alphaRegistry, eventAbi: events.alpha, ...range, fromBlock: Math.max(range.fromBlock, alphaFromBlock) });
    for (const log of promotions) {
      dailyFees.add(nativeToken, log.paidWei, 'Alpha Promotion Fees');
      dailyRevenue.add(nativeToken, log.paidWei, 'Alpha Promotion Fees To Genius');
    }
  }

  // Escrow credits/claims, fee sweeps and buyback execution only settle fees
  // already accrued above. Counting them would duplicate earlier revenue.
  return { dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue.clone(), dailySupplySideRevenue };
};

const revenueBreakdown = {
  'Curve Fees To Genius': 'The platform share of bonding-curve fees under each launch’s immutable fee policy.',
  'Hook Fees To Genius': 'The platform share of accrued Genius hook fees; meme-denominated fees are valued at the originating swap’s execution price.',
  'Token Creation Fees To Genius': 'Token creation fees retained by Genius, using the historical factory fee and intraperiod LaunchFeeUpdated events.',
  'Alpha Promotion Fees To Genius': 'Actual paidWei in AlphaPromoted events; free grants contribute zero.',
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  chains: [CHAIN.BSC],
  doublecounted: true, // pcs
  start,
  fetch,
  methodology: {
    Fees: 'Token creation, bonding-curve trading (including any launch-window surcharge), Genius hook trading and paid Alpha promotion fees. Fees accrue at launch/trade/promotion; settlements are excluded. Meme-denominated hook fees use the same swap’s quote/meme execution-price ratio, rounded down to quote base units.',
    Revenue: 'The Genius platform share of trading fees under each launch’s immutable policy, plus separately labeled creation and Alpha promotion fees. The creator-selected destination allocation (Foundation or creator), creator share and launched-meme buyback allocations are excluded.',
    ProtocolRevenue: 'The same protocol-retained portion as Revenue. Genius.fun has no protocol token receiving these fees.',
    SupplySideRevenue: 'Creator-selected destination allocations (Foundation or creator), creator shares and accrued funding for buybacks of individual launched meme tokens, calculated from immutable per-launch policies with contract integer rounding.',
  },
  breakdownMethodology: {
    Fees: {
      'Curve Trading Fees': 'CurveBuy and CurveSell fee + tax; CurveBuy.fee already contains any snipe surcharge.',
      'Hook Trading Fees': 'HookFeeCollected feeAmount + taxAmount, valued in the pool’s paired quote asset at the originating trade’s execution price when needed.',
      'Token Creation Fees': 'One historical factory launchFee per TokenLaunched, replaying same-period fee changes in log order.',
      'Alpha Promotion Fees': 'Actual BNB paid in AlphaPromoted events, including zero-cost grants.',
    },
    Revenue: revenueBreakdown,
    ProtocolRevenue: revenueBreakdown,
    SupplySideRevenue: {
      'Curve Fees To Foundation': 'Creator-selected destination allocation from curve fees routed to the shared Foundation vault; excluded from Genius platform revenue.',
      'Hook Fees To Foundation': 'Creator-selected destination allocation from hook fees routed to the shared Foundation vault; excluded from Genius platform revenue.',
      'Curve Fees To Creators': 'Creator share, any destination share selected for the creator, and separate creator tax on curve trades.',
      'Curve Fees For Meme Buybacks': 'Accrued curve-fee allocation reserved to buy back and burn that launch’s meme token.',
      'Hook Fees To Creators': 'Creator share, any destination share selected for the creator, and separate creator tax on hook trades.',
      'Hook Fees For Meme Buybacks': 'Accrued hook-fee allocation reserved to buy back and burn that launch’s meme token.',
    },
  },
};

export default adapter;
