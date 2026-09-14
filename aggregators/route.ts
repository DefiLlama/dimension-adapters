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
const creatorManagerDeploymentTimestam = 1789087787;
const credited = 'event Credited(address indexed recipient,address indexed depositor,uint256 amount)';
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
  // Revenue belongs to Route; buying protocol-owned LP is not a payment to outside LPs.
  // Do not add receiver conversions/escrow claims again. The mixed-source worker cannot
  // attribute realized holder distributions to swap fees alone; omit that metric, not zero.
  // Pool-hook creator fees accrue to Route as the token creator, not to outside creators.
  // Only the current manager's history is verified; omit earlier unknown income.
  if (options.toTimestamp >= creatorManagerDeploymentTimestam) {
    const credits = await options.getLogs({ target: creatorEscrow, eventAbi: credited, topics: creatorTopics });
    for (const log of credits) {
      if (log.recipient.toLowerCase() !== creatorManager || log.depositor.toLowerCase() !== creatorHook) continue;
      dailyFees.addGasToken(log.amount.toString(), METRIC.CREATOR_FEES);
      dailyRevenue.addGasToken(log.amount.toString(), 'Creator Fees To Route');
    }
  }
  return { dailyVolume, dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue, dailySupplySideRevenue: 0 };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  chains: [CHAIN.ROBINHOOD],
  fetch,
  start: '2026-09-05',
  methodology: {
    Volume: 'One side of successful swaps through current and historical Route settlement contracts, excluding nested engine events; includes contract-level integrations and treasury trades, not quotes or underlying pool hops.',
    Fees: 'Actual Route output-token swap fees from historical FeePaid and current Settled events, plus ROUTE pool-hook creator fees credited to the current manager from block 59844471; excludes pool/provider fees, gas, unverified earlier creator recipients and private transfers.',
    Revenue: 'Collected Route swap fees and ROUTE creator fees accrue to Route-controlled recipients; later conversions and allocations are not counted again.',
    ProtocolRevenue: 'Swap fees and creator fees retained by Route at collection, before subsequent capital allocations; excludes unverified holder distributions.',
    SupplySideRevenue: 'No portion of this aggregator fee is paid to external liquidity providers or referrers; protocol-owned liquidity is a capital allocation.',
  },
  breakdownMethodology: {
    Fees: {
      'Swap Fees': 'Actual emitted fee amounts, not an assumed fee rate multiplied by volume; includes historical fees and the September 11, 2026 tiered collector.',
      [METRIC.CREATOR_FEES]: 'Native ETH credited by the ROUTE pool hook to the current Route manager from block 59844471; counted at credit, not again on claim. Earlier recipient history is not covered.',
    },
    Revenue: {
      'Swap Fees To Route': 'Swap fees received by Route treasury or its fee receiver, before subsequent buybacks and protocol-owned liquidity allocations.',
      'Creator Fees To Route': 'ROUTE creator-hook credits received by the current Route manager; subsequent claims, conversions and allocations are not additional revenue.',
    },
    ProtocolRevenue: {
      'Swap Fees To Route': 'Route-retained swap fees at collection; subsequent conversions and escrow claims are not additional revenue.',
      'Creator Fees To Route': 'Route-retained ROUTE creator fees at escrow credit; subsequent claims and allocations are not additional revenue.',
    },
  },
};
export default adapter;
