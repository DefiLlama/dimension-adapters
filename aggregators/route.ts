import { FetchOptions, SimpleAdapter } from '../adapters/types';
import { Interface } from 'ethers';
import { CHAIN } from '../helpers/chains';
import { METRIC } from '../helpers/metrics';
import { addOneToken } from '../helpers/prices';

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
];
// Exact source: https://repo.sourcify.dev/4663/0xBFADcf357545cb185420eAD0fDE1008A289c0154
const collector = '0xbfadcf357545cb185420ead0fde1008a289c0154';
export const settled = 'event Settled(address indexed sender,address indexed recipient,address indexed tokenOut,uint256 grossAmountOut,uint256 feeBps,uint256 feeAmount,uint256 amountOut)';
const swapEvents = [
  'event Swapped(address indexed sender,address indexed recipient,address indexed tokenIn,address tokenOut,uint256 amountIn,uint256 amountOut)',
  'event Swapped(address indexed sender,address indexed recipient,address indexed tokenIn,address tokenOut,uint256 amountIn,uint256 amountOut,bytes32 routeHash)',
  'event Swapped(address indexed sender,address indexed recipient,address indexed tokenIn,address tokenOut,uint256 amountIn,uint256 amountOut,address intermediate,address firstAdapter,uint24 firstFee,address secondAdapter,uint24 secondFee)',
];
export const feePaid = 'event FeePaid(address indexed sender,address indexed recipient,address indexed token,uint256 grossAmountOut,uint256 feeAmount)';

// Verified manager binds this escrow and ROUTE pool hook in escrow()/poolKey():
// https://repo.sourcify.dev/4663/0xDa5790345FD25878e5186EBd98823814188AcfBE
const creatorEscrow = '0xd3afeb2a57f70ef218aa82451c51b2fb0416ac9e';
const creatorManager = '0xda5790345fd25878e5186ebd98823814188acfbe';
const creatorHook = '0xe5e702641ea86f4ae6cc3cdaed2b886f976be044';
// https://robinhoodchain.blockscout.com/tx/0x00a45c5d3843cd51e9e9b2bd825f915a285afb6b889e04c43266b2fc3c1642aa
const creatorManagerDeploymentTimestamp = 1789087787;
const credited = 'event Credited(address indexed recipient,address indexed depositor,uint256 amount)';
// Exact manager source above: emitted only after the buyback, LP addition and Safe payment succeed.
const executed = 'event Executed(uint256 indexed sequence,uint256 revenue,uint256 buybackEth,uint256 lpBudget,uint256 vaultEth,uint256 buybackTokens,uint256 positionId,uint128 liquidityAdded)';
// Filter the shared escrow at the RPC/indexer as well as validating decoded args.
const creatorTopics = new Interface([credited]).encodeFilterTopics('Credited', [creatorManager, creatorHook]) as string[];

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  for (const eventAbi of swapEvents) {
    const logs = await options.getLogs({ targets: engines, eventAbi });
    for (const log of logs) {
      // Wrappers emit the final swap as well as their inner engine. Count only the outer one.
      // The tiered collector is NOT in engines: it emits Settled, so its engine swap counts once.
      if (engines.includes(log.sender.toLowerCase())) continue;
      addOneToken({ balances: dailyVolume, token0: log.tokenIn, amount0: log.amountIn, token1: log.tokenOut, amount1: log.amountOut });
    }
  }
  const oldFees = await options.getLogs({ targets: engines, eventAbi: feePaid });
  const currentFees = await options.getLogs({ target: collector, eventAbi: settled });
  for (const log of oldFees) {
    dailyFees.add(log.token, log.feeAmount, 'Swap Fees');
    dailyRevenue.add(log.token, log.feeAmount, 'Swap Fees To Route');
  }
  for (const log of currentFees) {
    dailyFees.add(log.tokenOut, log.feeAmount, 'Swap Fees');
    dailyRevenue.add(log.tokenOut, log.feeAmount, 'Swap Fees To Route');
  }
  // Creator fees belong to Route. Claims and fee conversions are not new income.
  if (options.toTimestamp > creatorManagerDeploymentTimestamp) {
    const credits = await options.getLogs({ target: creatorEscrow, eventAbi: credited, topics: creatorTopics });
    for (const log of credits) {
      if (log.recipient.toLowerCase() !== creatorManager || log.depositor.toLowerCase() !== creatorHook) continue;
      dailyFees.addGasToken(log.amount.toString(), METRIC.CREATOR_FEES);
      dailyRevenue.addGasToken(log.amount.toString(), 'Creator Fees To Route');
    }
  }
  const dailyProtocolRevenue = dailyRevenue.clone();
  // Earlier managers are not covered, so leave their holder revenue unknown.
  if (options.toTimestamp <= creatorManagerDeploymentTimestamp) {
    return { dailyVolume, dailyFees, dailyRevenue, dailyProtocolRevenue, dailySupplySideRevenue: 0 };
  }
  const dailyHoldersRevenue = options.createBalances();
  const executions = await options.getLogs({ target: creatorManager, eventAbi: executed });
  for (const log of executions) {
    // Only the dedicated buyback leg counts; LP token purchases remain Route-owned capital.
    const buyback = BigInt(log.buybackEth);
    dailyHoldersRevenue.addGasToken(buyback.toString(), METRIC.TOKEN_BUY_BACK);
    dailyProtocolRevenue.addGasToken((-buyback).toString(), METRIC.TOKEN_BUY_BACK);
  }
  return { dailyVolume, dailyFees, dailyRevenue, dailyProtocolRevenue, dailyHoldersRevenue, dailySupplySideRevenue: 0 };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  chains: [CHAIN.ROBINHOOD],
  fetch,
  start: '2026-09-05',
  allowNegativeValue: true, // Buybacks can spend revenue collected in an earlier period.
  methodology: {
    Volume: 'Completed swaps through the tracked Route contracts, counted once per trade, including integrations and treasury trades but excluding quotes and individual pool hops.',
    Fees: 'Route swap fees and creator fees earned from trading the ROUTE token, excluding gas, other providers\' fees, private transfers and creator fees before the current manager.',
    Revenue: 'Swap fees and ROUTE creator fees earned by Route, counted once before buybacks and treasury spending.',
    ProtocolRevenue: 'Tracked revenue less completed ROUTE buybacks, with liquidity owned by Route and treasury reserves remaining protocol funds.',
    HoldersRevenue: 'ETH spent on completed ROUTE buybacks by the revenue manager deployed on September 11, 2026, excluding pending budgets, liquidity purchases and earlier managers.',
    SupplySideRevenue: 'None of the tracked Route fees go to outside liquidity providers or referrers; buying liquidity that Route owns is treasury spending.',
  },
  breakdownMethodology: {
    Fees: {
      'Swap Fees': 'Fees paid on swaps through the tracked Route contracts, using the actual amount charged on each trade.',
      [METRIC.CREATOR_FEES]: 'ETH earned by Route as the ROUTE token creator, counted when the pool hook credits the current manager from block 59844471; earlier recipients are not covered.',
    },
    Revenue: {
      'Swap Fees To Route': 'Swap fees received by Route before buybacks and treasury spending.',
      'Creator Fees To Route': 'ROUTE creator fees earned by the current manager; claiming or moving the money does not count as new revenue.',
    },
    ProtocolRevenue: {
      'Swap Fees To Route': 'Swap fees collected by Route, before the separate deduction for completed buybacks.',
      'Creator Fees To Route': 'ROUTE creator fees credited to Route, before the separate deduction for completed buybacks.',
      [METRIC.TOKEN_BUY_BACK]: 'ETH spent buying ROUTE, deducted from protocol revenue when the purchase completes; spending earlier receipts can make this period\'s net amount negative.',
    },
    HoldersRevenue: {
      [METRIC.TOKEN_BUY_BACK]: 'Actual ETH spent by the current manager buying ROUTE for the treasury Safe, not burning it; each completed batch assigns 35% to buybacks, 30% to Route-owned liquidity and the remainder to the treasury vault, with only the buyback leg counted here.',
    },
  },
};
export default adapter;
