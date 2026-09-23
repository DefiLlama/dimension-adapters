import { FetchOptions, SimpleAdapter } from '../adapters/types';
import { Interface } from 'ethers';
import { CHAIN } from '../helpers/chains';
import { METRIC } from '../helpers/metrics';
import { addOneToken } from '../helpers/prices';
import { earlyPoolBuybacks, earlyExecutorBuybacks } from './route/earlyBuybacks';

// Historical settlement registry: https://github.com/routerh/route/blob/main/lib/route/activity.ts
// Keep old emitters for backfills. They are not current approval recommendations.
const engines = [
  '0xfb866d8cd2796efd920a7a062814aeb88b1d2bcb',
  '0xb1a65445695b79d042caaa86b5aa1e3b5f38ac03',
  '0xd8f7171886f8476ece2e51cffe8c4c637815a815',
  '0x872d8bd2d903f83377c873d3234fb762a4fd4703',
  '0xde02d8438a92084eddff012c0a4673a0832da21d',
  '0x485e249b82587531165ef2fe97a768813964ebd3',
  '0x201a935146e1283f35bb54b8fe7a4c584265b7e8',
  '0x418d76ffa3026fe9e8b067cc39251cca8fcba3f5',
  '0x22c1bba36ba220964d029eb4b1ef7c6ed167e32e',
  '0x70656a2b4a401def17c55687c19c536c0fad4db1',
  '0x9990a63ef329ab407956b4fe5a812aba0d81e20c',
  // Provider settlements activated September 12, 2026. Both emit the final Swapped event.
  // https://repo.sourcify.dev/4663/0xD49259D75786e7FFba599e400e6bD83bD3758A71
  '0xd49259d75786e7ffba599e400e6bd83bd3758a71',
  // https://repo.sourcify.dev/4663/0x90C74e5aB8E383e92c39c524B4eb0767DD9f4bC4
  '0x90c74e5ab8e383e92c39c524b4eb0767dd9f4bc4',
  // Premium route engine deployed September 16, 2026; do not count inner pool hops.
  // https://repo.sourcify.dev/4663/0xe98a7AaB7DcB76497ADBD5080Dc4551888F437b9
  '0xe98a7aab7dcb76497adbd5080dc4551888f437b9',
  // Ramp fee receivers activated September 18, 2026; retain the predecessors above.
  // https://repo.sourcify.dev/4663/0x486c62ba146823324722ec3350f0296fd7cae3a0
  '0x486c62ba146823324722ec3350f0296fd7cae3a0',
  // https://repo.sourcify.dev/4663/0xc6d9b0a91ea71ee1df9733e2a07ab830dcd0c15c
  '0xc6d9b0a91ea71ee1df9733e2a07ab830dcd0c15c',
];
// Exact source: https://repo.sourcify.dev/4663/0xBFADcf357545cb185420eAD0fDE1008A289c0154
const collectors = [
  '0xbfadcf357545cb185420ead0fde1008a289c0154',
  // Premium tiered collector, deployed September 16; same Settled ABI.
  // https://repo.sourcify.dev/4663/0xaB860677550312C4Ec90c17474A2dFB3a483B670
  '0xab860677550312c4ec90c17474a2dfb3a483b670',
  // September 18 replacements: regular tiered collector, then Premium collector.
  // https://repo.sourcify.dev/4663/0xc49663f88f1cfb448fa8730f960829ca3a470c13
  '0xc49663f88f1cfb448fa8730f960829ca3a470c13',
  // https://repo.sourcify.dev/4663/0x84497be24ae78b3232f7009d619a33eb500a46cf
  '0x84497be24ae78b3232f7009d619a33eb500a46cf',
];
// The integrated executors above emit OutputFee, not Settled or FeePaid.
const integratedFeeExecutors = [
  '0xd49259d75786e7ffba599e400e6bd83bd3758a71',
  '0x90c74e5ab8e383e92c39c524b4eb0767dd9f4bc4',
  '0x486c62ba146823324722ec3350f0296fd7cae3a0',
  '0xc6d9b0a91ea71ee1df9733e2a07ab830dcd0c15c',
];
const outputFee = 'event OutputFee(address indexed token,uint256 gross,uint256 feeBps,uint256 feeAmount)';
export const settled = 'event Settled(address indexed sender,address indexed recipient,address indexed tokenOut,uint256 grossAmountOut,uint256 feeBps,uint256 feeAmount,uint256 amountOut)';
const swapEvents = [
  'event Swapped(address indexed sender,address indexed recipient,address indexed tokenIn,address tokenOut,uint256 amountIn,uint256 amountOut)',
  'event Swapped(address indexed sender,address indexed recipient,address indexed tokenIn,address tokenOut,uint256 amountIn,uint256 amountOut,bytes32 routeHash)',
  'event Swapped(address indexed sender,address indexed recipient,address indexed tokenIn,address tokenOut,uint256 amountIn,uint256 amountOut,address intermediate,address firstAdapter,uint24 firstFee,address secondAdapter,uint24 secondFee)',
];
export const feePaid = 'event FeePaid(address indexed sender,address indexed recipient,address indexed token,uint256 grossAmountOut,uint256 feeAmount)';

// ROUTE's original native-ETH Pons pool. The creator share is paid to escrow in
// the same transaction as PoolFeesSwept, regardless of creator-recipient migrations.
// https://repo.sourcify.dev/4663/0xe5e702641ea86f4ae6cc3cdaed2b886f976be044
const creatorHook = '0xe5e702641ea86f4ae6cc3cdaed2b886f976be044';
const routePool = '0x220e47dde1a5180cb131d4c720abf66d5c36fbdf3af91522f7b1c7f749770d8f';
// Token-specific curve created in this transaction; its FeesSwept pays the creator share.
// https://robinhoodchain.blockscout.com/tx/0xd0d0a88231c0e48d59f804e9ab5d082a5e758e9993ba1c624753798e59634ace
// Curve source is included in https://repo.sourcify.dev/4663/0x7ed598bcef8bd9edd8c97a195c6d13f40801ec7e
const routeCurve = '0xfdf8bf3a9a9facde8a5304ccaa462c75b04b3042';
const poolFeesSwept = 'event PoolFeesSwept(bytes32 indexed poolId,uint256 protocolAmount,uint256 buybackAmount,uint256 creatorAmount,uint256 tokensLocked)';
const curveFeesSwept = 'event FeesSwept(uint256 protocolAmount,uint256 buybackAmount,uint256 creatorAmount)';
const curveFeesRescued = 'event FeesRescued(address indexed protocolRecipient,address indexed creatorRecipient,uint256 protocolAmount,uint256 creatorAmount)';
const creatorTopics = new Interface([poolFeesSwept]).encodeFilterTopics('PoolFeesSwept', [routePool]) as string[];

// All automated generations remain tracked so refills preserve their completed buys.
// https://repo.sourcify.dev/4663/0xAdA939f2f1482a13e3c0c612bCB14f2615221E9d
const firstManager = '0xada939f2f1482a13e3c0c612bcb14f2615221e9d';
// https://repo.sourcify.dev/4663/0xDa5790345FD25878e5186EBd98823814188AcfBE
const creatorManager = '0xda5790345fd25878e5186ebd98823814188acfbe';
// https://repo.sourcify.dev/4663/0xdd4F63Ff19b8A871fadc734de2c5fE13b35f1631
const rampManager = '0xdd4f63ff19b8a871fadc734de2c5fe13b35f1631';
const firstExecuted = 'event Executed(uint256 indexed sequence,uint256 claimed,uint256 boughtWith,uint256 tokensOut,uint256 treasuryEth)';
const executed = 'event Executed(uint256 indexed sequence,uint256 revenue,uint256 buybackEth,uint256 lpBudget,uint256 vaultEth,uint256 buybackTokens,uint256 positionId,uint128 liquidityAdded)';
const rampExecuted = 'event Executed(uint256 indexed sequence,uint256 revenue,uint256 buybackEth,uint256 lpBudget,uint256 vaultEth,uint256 buybackTokens,uint256 indexed rangeId,uint128 addedShares,address indexed lpOwner)';
const liquidityFunding = 'Liquidity Funding';
const devWallet = '0x6f6afe1e23a59cdc5901f2626301d6d408d72d9b';
const routeToken = '0x4a72b9702f991b790788f8afa9e7112541f4e8f8';
// Frozen historical scope through the last reviewed dev purchase (September 8).
const lastDevBuybackBlock = 57687801;
const poolManager = '0x8366a39cc670b4001a1121b8f6a443a643e40951';
const poolSwap = 'event Swap(bytes32 indexed id,address indexed sender,int128 amount0,int128 amount1,uint160 sqrtPriceX96,uint128 liquidity,int24 tick,uint24 fee)';
const poolSwapTopics = new Interface([poolSwap]).encodeFilterTopics('Swap', [routePool]) as string[];

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();
  let buybackEth = 0n;
  let lpFundingEth = 0n;
  const addBuyback = (amount: string | bigint) => { buybackEth += BigInt(amount); };
  const fromBlock = await options.getFromBlock();
  // SDK log ranges are inclusive; adjacent hourly pulls share their boundary block.
  const toBlock = (await options.getToBlock()) - 1;
  for (const eventAbi of swapEvents) {
    const logs = await options.getLogs({ toBlock, targets: engines, eventAbi, onlyArgs: false });
    for (const entry of logs) {
      const log = entry.args;
      // Wrappers emit the final swap as well as their inner engine. Count only the outer one.
      // The tiered collector is NOT in engines: it emits Settled, so its engine swap counts once.
      if (engines.includes(log.sender.toLowerCase())) continue;
      addOneToken({ balances: dailyVolume, token0: log.tokenIn, amount0: log.amountIn, token1: log.tokenOut, amount1: log.amountOut });
      // Three historical buys used Route executors, not the Pons-router pool registry.
      if (earlyExecutorBuybacks.has(entry.transactionHash)) {
        if (log.sender.toLowerCase() !== devWallet || log.recipient.toLowerCase() !== devWallet ||
            log.tokenIn.toLowerCase() !== '0x0000000000000000000000000000000000000000' ||
            log.tokenOut.toLowerCase() !== routeToken) throw new Error('Unexpected historical executor buyback');
        addBuyback(log.amountIn.toString());
      }
    }
  }
  const oldFees = await options.getLogs({ toBlock, targets: engines, eventAbi: feePaid });
  const currentFees = await options.getLogs({ toBlock, targets: collectors, eventAbi: settled });
  const integratedFees = await options.getLogs({ toBlock, targets: integratedFeeExecutors, eventAbi: outputFee });
  for (const log of integratedFees) {
    dailyFees.add(log.token, log.feeAmount, 'Swap Fees');
    dailyRevenue.add(log.token, log.feeAmount, 'Swap Fees To Route');
  }
  for (const log of oldFees) {
    dailyFees.add(log.token, log.feeAmount, 'Swap Fees');
    dailyRevenue.add(log.token, log.feeAmount, 'Swap Fees To Route');
  }
  for (const log of currentFees) {
    dailyFees.add(log.tokenOut, log.feeAmount, 'Swap Fees');
    dailyRevenue.add(log.tokenOut, log.feeAmount, 'Swap Fees To Route');
  }
  // Count only ROUTE's creator share, not Pons protocol fees or unrelated pools.
  // Covers dev wallet, first manager, September 11 manager and Ramp recipient alike.
  // Do not also count escrow credits/claims or converted swap-fee deposits as income.
  const creatorFees = await options.getLogs({ toBlock, target: creatorHook, eventAbi: poolFeesSwept, topics: creatorTopics });
  const curveFees = await options.getLogs({ toBlock, target: routeCurve, eventAbi: curveFeesSwept });
  const rescuedCurveFees = await options.getLogs({ toBlock, target: routeCurve, eventAbi: curveFeesRescued });
  for (const log of [...creatorFees, ...curveFees, ...rescuedCurveFees]) {
    dailyFees.addGasToken(log.creatorAmount.toString(), METRIC.CREATOR_FEES);
    dailyRevenue.addGasToken(log.creatorAmount.toString(), 'Creator Fees To Route');
  }

  if (fromBlock <= lastDevBuybackBlock) {
    const purchases = await options.getLogs({ toBlock, target: poolManager, eventAbi: poolSwap, topics: poolSwapTopics, onlyArgs: false });
    for (const log of purchases) {
      if (!earlyPoolBuybacks.has(log.transactionHash)) continue;
      if (BigInt(log.args.amount0) >= 0n || BigInt(log.args.amount1) <= 0n) throw new Error('Unexpected historical buyback direction');
      addBuyback(-BigInt(log.args.amount0));
    }
  }
  const firstExecutions = await options.getLogs({ toBlock, target: firstManager, eventAbi: firstExecuted });
  for (const log of firstExecutions) addBuyback(log.boughtWith.toString());
  const executions = await options.getLogs({ toBlock, target: creatorManager, eventAbi: executed });
  const rampExecutions = await options.getLogs({ toBlock, target: rampManager, eventAbi: rampExecuted });
  for (const log of [...executions, ...rampExecutions]) {
    addBuyback(log.buybackEth.toString());
    // Full ETH allocation in a successful cycle, including the paired-asset budget.
    // This is LP funding, NOT extra ROUTE bought or exact assets deposited; leftovers carry forward.
    lpFundingEth += BigInt(log.lpBudget);
  }
  dailyHoldersRevenue.addGasToken(buybackEth.toString(), METRIC.TOKEN_BUY_BACK);
  dailyHoldersRevenue.addGasToken(lpFundingEth.toString(), liquidityFunding);
  const dailyProtocolRevenue = dailyRevenue.clone();
  dailyProtocolRevenue.addGasToken((-buybackEth).toString(), METRIC.TOKEN_BUY_BACK);
  dailyProtocolRevenue.addGasToken((-lpFundingEth).toString(), liquidityFunding);
  return { dailyVolume, dailyFees, dailyRevenue, dailyProtocolRevenue, dailyHoldersRevenue, dailySupplySideRevenue: 0 };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true, // Hourly slices are summed into UTC daily totals; chart granularity is a dashboard setting.
  chains: [CHAIN.ROBINHOOD],
  fetch,
  start: '2026-09-05',
  allowNegativeValue: true, // Buybacks and LP funding can use revenue collected in an earlier period.
  methodology: {
    Volume: 'Completed swaps through the tracked Route contracts, counted once per trade, including integrations and treasury trades but excluding quotes and individual pool hops.',
    Fees: 'Actual Route swap fees and ROUTE creator fees from its original bonding curve and Pons pool, excluding gas, other providers\' fees, private transfers and cross-chain fees.',
    Revenue: 'Swap fees and ROUTE creator fees earned by Route, counted once before buybacks and treasury spending.',
    ProtocolRevenue: 'Tracked revenue less Buybacks + LP funding; these capital allocations may use revenue collected on earlier days.',
    HoldersRevenue: 'Buybacks + LP funding: actual ETH swap input for early creator-revenue-funded dev-wallet purchases and completed automated buybacks, plus the full ETH liquidity budget assigned by completed cycles; this is capital allocation, not a distribution to token holders.',
    SupplySideRevenue: 'None of the tracked fee receipts are paid to outside liquidity providers or referrers; LP funding is a subsequent capital allocation.',
  },
  breakdownMethodology: {
    Fees: {
      'Swap Fees': 'Fees paid on swaps through the tracked Route contracts, using the actual amount charged on each trade.',
      [METRIC.CREATOR_FEES]: 'Actual creatorAmount distributed by ROUTE\'s bonding curve or original Pons pool, including the original dev wallet and every manager recipient; excludes the Pons protocol share.',
    },
    Revenue: {
      'Swap Fees To Route': 'Swap fees received by Route before buybacks and treasury spending.',
      'Creator Fees To Route': 'ROUTE creator fees paid to its historical or current recipient; later escrow claims, fee conversions and internal transfers are not additional income.',
    },
    ProtocolRevenue: {
      'Swap Fees To Route': 'Swap fees collected by Route, before the separate deduction for completed buybacks.',
      'Creator Fees To Route': 'ROUTE creator fees credited to Route, before the separate deduction for completed buybacks.',
      [METRIC.TOKEN_BUY_BACK]: 'ETH spent buying ROUTE, deducted from protocol revenue when the purchase completes; spending earlier receipts can make this period\'s net amount negative.',
      [liquidityFunding]: 'Full liquidity budget allocated in completed cycles, deducted once; subsequent use of carried balances is not another allocation.',
    },
    HoldersRevenue: {
      [METRIC.TOKEN_BUY_BACK]: 'Actual ETH input for 100 post-launch dev-wallet buys funded by ROUTE creator fees (see the historical funding reconciliation) and completed buys from all three automated managers; excludes the launch purchase, gas, and ROUTE bought within the separately counted LP budget.',
      [liquidityFunding]: 'Full ETH lpBudget in successful cycles, including funding for both assets and carry-forward balances, not exact deposited value: 30% in the September 11 manager and the September 18 Ramp manager. Original LP positions belong to the treasury Safe; Ramp shares belong to the approved LP wallet 0x09Efc01e903033D6642d20a8C5cF6Bee210cFBF8. Dedicated buybacks changed from 65% in the first manager to 35% on September 11 and 30% on September 18; all amounts are read from events, never inferred from these rates.',
    },
  },
};
export default adapter;
