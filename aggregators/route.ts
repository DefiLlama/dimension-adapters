import { FetchOptions, SimpleAdapter } from '../adapters/types';
import { Interface } from 'ethers';
import { CHAIN } from '../helpers/chains';
import { METRIC } from '../helpers/metrics';
import { addOneToken } from '../helpers/prices';
import { earlyPoolBuybacks, earlyExecutorBuybacks } from './route/earlyBuybacks';

// Current Route contracts: https://docs.route.fun/contracts. Older emitters below are kept for
// backfills; they are not current approval recommendations.
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
  // September 26 replacements for the 60/5/35 manager; same Swapped/OutputFee ABI.
  // https://repo.sourcify.dev/4663/0x71d51561671e5CaB84AD6D1A2aab57DE082e9DeB
  '0x71d51561671e5cab84ad6d1a2aab57de082e9deb',
  // https://repo.sourcify.dev/4663/0x1562B4EA2cC64C36A7025D04426BCf2729222ebb
  '0x1562b4ea2cc64c36a7025d04426bcf2729222ebb',
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
  // September 26 replacements: regular tiered collector, then Premium collector.
  // https://repo.sourcify.dev/4663/0x66537759Eb8Fcea1d4B6b55405EAF8DD3e13Fd53
  '0x66537759eb8fcea1d4b6b55405eaf8dd3e13fd53',
  // https://repo.sourcify.dev/4663/0xEda33d977CeFCFd56b85c7525e91bB383D92069C
  '0xeda33d977cefcfd56b85c7525e91bb383d92069c',
];
// Route v2 settlements emit one Settled per swap and no Swapped event, so Settled is the only
// record of both v2 volume (gross output) and fees. Fees go straight to the treasury Safe.
const v2Collectors = [
  // Route v2 executor used by route.fun since October 1, 2026.
  // https://repo.sourcify.dev/4663/0x27F38C4fd323D635d0E15054a6cfbdFc9D076F25
  '0x27f38c4fd323d635d0e15054a6cfbdfc9d076f25',
  // Earlier v2 fee collector (September 26).
  // https://repo.sourcify.dev/4663/0x9F8f538EA588CcF935876527115BB2A834c2F5Fc
  '0x9f8f538ea588ccf935876527115bb2a834c2f5fc',
];
// Builder executors call the engines above, whose Swapped events already carry the volume.
// Their own Route fee and integrator fee are only reported in BuilderSettled.
const builderExecutors = [
  // https://repo.sourcify.dev/4663/0x8BD4C3f0128DECd897600d635800017Abcc1f8a5
  '0x8bd4c3f0128decd897600d635800017abcc1f8a5',
  // https://repo.sourcify.dev/4663/0x143728B383f6cdBE5c8b53e448A3eB1cc9Bff2Ef
  '0x143728b383f6cdbe5c8b53e448a3eb1cc9bff2ef',
  // https://repo.sourcify.dev/4663/0xeb4881239a5997255E7F90F2414F4a4C3Cf8d197
  '0xeb4881239a5997255e7f90f2414f4a4c3cf8d197',
  // https://repo.sourcify.dev/4663/0xCBE3987A243541CC9592CA08838cf1233C15F6E1
  '0xcbe3987a243541cc9592ca08838cf1233c15f6e1',
];
export const builderSettled = 'event BuilderSettled(bytes32 indexed id,bytes32 indexed builder,bytes32 indexed keyId,address payer,address recipient,address tokenOut,uint256 gross,uint256 routeFee,uint256 builderFee,uint256 amountOut,address tokenIn,uint256 amountIn,address builderRecipient,uint256 policyVersion)';
// The integrated executors above emit OutputFee, not Settled or FeePaid.
const integratedFeeExecutors = [
  '0xd49259d75786e7ffba599e400e6bd83bd3758a71',
  '0x90c74e5ab8e383e92c39c524b4eb0767dd9f4bc4',
  '0x486c62ba146823324722ec3350f0296fd7cae3a0',
  '0xc6d9b0a91ea71ee1df9733e2a07ab830dcd0c15c',
  '0x71d51561671e5cab84ad6d1a2aab57de082e9deb',
  '0x1562b4ea2cc64c36a7025d04426bcf2729222ebb',
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
// Second Ramp deployment (60% buyback / 5% LP / 35% treasury), creator-fee recipient since
// Safe transaction 0x087a1c171f1daa1f2a235f0d5076c73906fe9307a4515b1ca5cd8111c6d1347b.
// https://repo.sourcify.dev/4663/0xd6fA32A8CFB31c2f237059E4f19a5EFF79047957
const rampManagers = [rampManager, '0xd6fa32a8cfb31c2f237059e4f19a5eff79047957'];
const firstExecuted = 'event Executed(uint256 indexed sequence,uint256 claimed,uint256 boughtWith,uint256 tokensOut,uint256 treasuryEth)';
const executed = 'event Executed(uint256 indexed sequence,uint256 revenue,uint256 buybackEth,uint256 lpBudget,uint256 vaultEth,uint256 buybackTokens,uint256 positionId,uint128 liquidityAdded)';
const rampExecuted = 'event Executed(uint256 indexed sequence,uint256 revenue,uint256 buybackEth,uint256 lpBudget,uint256 vaultEth,uint256 buybackTokens,uint256 indexed rangeId,uint128 addedShares,address indexed lpOwner)';
const liquidityFunding = 'Liquidity Funding';
const devWallet = '0x6f6afe1e23a59cdc5901f2626301d6d408d72d9b';
// Route's own reporting (policy exclude-d5d7-20260914-v1) omits this wallet's swaps from
// volume when it is the swap's sender or recipient. Its trades and fees still count.
const volumeExcluded = ['0xd5d7c80c9f8ddd278526a2e46f0a57275fa6116d'];
const isVolumeExcluded = (sender: string, recipient: string) =>
  volumeExcluded.includes(sender.toLowerCase()) || volumeExcluded.includes(recipient.toLowerCase());
const routeToken = '0x4a72b9702f991b790788f8afa9e7112541f4e8f8';
// Frozen historical scope through the last reviewed dev purchase (September 8).
const lastDevBuybackBlock = 57687801;
const poolManager = '0x8366a39cc670b4001a1121b8f6a443a643e40951';
const poolSwap = 'event Swap(bytes32 indexed id,address indexed sender,int128 amount0,int128 amount1,uint160 sqrtPriceX96,uint128 liquidity,int24 tick,uint24 fee)';
const poolSwapTopics = new Interface([poolSwap]).encodeFilterTopics('Swap', [routePool]) as string[];

// Capital allocation is retained separately; it is not a supported DefiLlama income metric.
export const fetchRouteAccounting = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
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
      if (!isVolumeExcluded(log.sender, log.recipient)) addOneToken({ balances: dailyVolume, token0: log.tokenIn, amount0: log.amountIn, token1: log.tokenOut, amount1: log.amountOut });
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
  const v2Settlements = await options.getLogs({ toBlock, targets: v2Collectors, eventAbi: settled });
  for (const log of v2Settlements) {
    if (!isVolumeExcluded(log.sender, log.recipient)) dailyVolume.add(log.tokenOut, log.grossAmountOut);
    dailyFees.add(log.tokenOut, log.feeAmount, 'Swap Fees');
    dailyRevenue.add(log.tokenOut, log.feeAmount, 'Swap Fees To Route');
  }
  const builderSettlements = await options.getLogs({ toBlock, targets: builderExecutors, eventAbi: builderSettled });
  for (const log of builderSettlements) {
    dailyFees.add(log.tokenOut, log.routeFee, 'Swap Fees');
    dailyRevenue.add(log.tokenOut, log.routeFee, 'Swap Fees To Route');
    dailyFees.add(log.tokenOut, log.builderFee, 'Builder Fees');
    dailySupplySideRevenue.add(log.tokenOut, log.builderFee, 'Builder Fees');
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
  const rampExecutions = await options.getLogs({ toBlock, targets: rampManagers, eventAbi: rampExecuted });
  for (const log of [...executions, ...rampExecutions]) {
    addBuyback(log.buybackEth.toString());
    // Full ETH allocation in a successful cycle, including the paired-asset budget.
    // This is LP funding, NOT extra ROUTE bought or exact assets deposited; leftovers carry forward.
    lpFundingEth += BigInt(log.lpBudget);
  }
  dailyHoldersRevenue.addGasToken(buybackEth.toString(), METRIC.TOKEN_BUY_BACK);
  const dailyCapitalAllocation = options.createBalances();
  dailyCapitalAllocation.addGasToken(lpFundingEth.toString(), liquidityFunding);
  const dailyProtocolRevenue = dailyRevenue.clone();
  dailyProtocolRevenue.addGasToken((-buybackEth).toString(), METRIC.TOKEN_BUY_BACK);

  return { dailyVolume, dailyFees, dailyRevenue, dailyProtocolRevenue, dailyHoldersRevenue, dailySupplySideRevenue, dailyCapitalAllocation };
};

// Route's Arc executor (first swap September 16) charges no Route fee: volume only.
// https://arcscan.app/address/0x33C65bA72B023BF6B207D7B62275630cA433AFB8
const arcExecutor = '0x33c65ba72b023bf6b207d7b62275630ca433afb8';
const arcUsdc = '0x3600000000000000000000000000000000000000';
export const arcExecuted = 'event Executed(address indexed sender,address indexed recipient,address tokenIn,address tokenOut,uint256 amountIn,uint256 amountOut)';
export const fetchArc = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const toBlock = (await options.getToBlock()) - 1;
  const logs = await options.getLogs({ toBlock, target: arcExecutor, eventAbi: arcExecuted });
  for (const log of logs) {
    if (isVolumeExcluded(log.sender, log.recipient)) continue;
    // Arc's USDC ERC20 interface (6 decimals) is not priced by the coins API; value it directly.
    if (log.tokenIn.toLowerCase() === arcUsdc) dailyVolume.addUSDValue(Number(log.amountIn) / 1e6);
    else if (log.tokenOut.toLowerCase() === arcUsdc) dailyVolume.addUSDValue(Number(log.amountOut) / 1e6);
    else addOneToken({ balances: dailyVolume, token0: log.tokenIn, amount0: log.amountIn, token1: log.tokenOut, amount1: log.amountOut });
  }
  return { dailyVolume, dailyFees: 0, dailyRevenue: 0, dailyProtocolRevenue: 0, dailyHoldersRevenue: 0, dailySupplySideRevenue: 0 };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true, // Hourly slices are summed into UTC daily totals; chart granularity is a dashboard setting.
  fetch: async (options) => {
    if (options.chain === CHAIN.ARC) return fetchArc(options);
    // Only export supported income/volume dimensions; LP funding is not holder income.
    const { dailyCapitalAllocation, ...incomeAndVolume } = await fetchRouteAccounting(options);
    return incomeAndVolume;
  },
  adapter: {
    [CHAIN.ROBINHOOD]: { start: '2026-09-05' },
    [CHAIN.ARC]: { start: '2026-09-15' },
  },
  allowNegativeValue: true, // Buybacks can use revenue collected in an earlier period.
  methodology: {
    Volume: 'Completed swaps through every Route settlement generation (original engines, fee collectors and provider executors, builder integrations and the Route v2 executor that route.fun uses since October 1, 2026), counted once per trade, including integrations and treasury trades but excluding quotes, individual pool hops and swaps sent from or to wallet 0xd5d7c80c9f8ddd278526a2e46f0a57275fa6116d, which Route excludes from its own reported volume.',
    Fees: 'Actual Route swap fees (including builder-integration and Route v2 swaps), integrator fees on builder swaps, and ROUTE creator fees from its original bonding curve and Pons pool, excluding gas, other providers\' fees, API subscriptions, private transfers and cross-chain fees.',
    Revenue: 'Swap fees and ROUTE creator fees earned by Route, counted once before buybacks and treasury spending; integrator fees paid to builders are excluded.',
    ProtocolRevenue: 'Tracked revenue less revenue-funded ROUTE buybacks, which may spend receipts from earlier days; LP funding is a separate capital allocation, not a revenue deduction.',
    HoldersRevenue: 'Actual ETH input for early creator-revenue-funded dev-wallet purchases and completed automated ROUTE buybacks; excludes all LP budgets and purchases made for liquidity.',
    SupplySideRevenue: 'Integrator fees paid to builders on builder-integration swaps. No other tracked fee receipt is paid to outside liquidity providers or referrers; LP funding is a subsequent capital allocation.',
  },
  breakdownMethodology: {
    Fees: {
      'Swap Fees': 'Route fees paid on swaps through the tracked Route contracts, using the actual amount charged on each trade.',
      'Builder Fees': 'Integrator fees charged on builder-integration swaps and paid directly to the builder.',
      [METRIC.CREATOR_FEES]: 'Actual creatorAmount distributed by ROUTE\'s bonding curve or original Pons pool, including the original dev wallet and every manager recipient; excludes the Pons protocol share.',
    },
    Revenue: {
      'Swap Fees To Route': 'Swap fees received by Route before buybacks and treasury spending, including Route v2 fees paid directly to the treasury Safe.',
      'Creator Fees To Route': 'ROUTE creator fees paid to its historical or current recipient; later escrow claims, fee conversions and internal transfers are not additional income.',
    },
    ProtocolRevenue: {
      'Swap Fees To Route': 'Swap fees collected by Route, before the separate deduction for completed buybacks.',
      'Creator Fees To Route': 'ROUTE creator fees credited to Route, before the separate deduction for completed buybacks.',
      [METRIC.TOKEN_BUY_BACK]: 'ETH spent buying ROUTE, deducted from protocol revenue when the purchase completes; spending earlier receipts can make this period\'s net amount negative.',
    },
    SupplySideRevenue: {
      'Builder Fees': 'Integrator fees paid to builders on builder-integration swaps.',
    },
    HoldersRevenue: {
      [METRIC.TOKEN_BUY_BACK]: 'Actual ETH input for 100 post-launch dev-wallet buys funded by ROUTE creator fees (see the historical funding reconciliation) and completed buys from all four automated managers (the current Ramp manager splits revenue 60% buyback, 5% LP, 35% treasury); excludes the launch purchase, gas, and ROUTE bought within the separate capital-allocation budget.',
    },
  },
};
export default adapter;
