import { FetchOptions, FetchV2, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";

const SECONDS_PER_YEAR = 31_536_000n;
const MAX_FEE_BPS = 10000n;
const FACTORY = '0xe2c4a5C2AB1ed5745D206B33cc0abf0A5D34753d'

const METRICS = {
  BorrowOpeningFee: 'Borrow Opening Fee',
  RateAdjustmentFee: 'Rate Adjustment Fee',
};

const ABIS = {
  DeployNewMarket: 'event DeployNewMarket(address indexed deployer, address indexed trove_manager, address sorted_troves, address dutch_desk, address auction, address lender)',
  OpenTrove: 'event OpenTrove(uint256 indexed trove_id, address indexed trove_owner, uint256 collateral_amount, uint256 debt_amount, uint256 upfront_fee, uint256 annual_interest_rate)',
  Borrow: 'event Borrow(uint256 indexed trove_id, address indexed trove_owner, uint256 debt_amount, uint256 upfront_fee)',
  AdjustInterestRate: 'event AdjustInterestRate(uint256 indexed trove_id, address indexed trove_owner, uint256 new_annual_interest_rate, uint256 upfront_fee)',
};

const fetch: FetchV2 = async (options: FetchOptions) => {
  const { createBalances, getLogs, api, fromApi, toApi, startTimestamp, endTimestamp } = options;

  const dailyFees = createBalances();
  const dailyRevenue = createBalances();
  const dailySupplySideRevenue = createBalances();

  const splitAndAdd = (token: string, amount: bigint, label: string, perfFeeBps: bigint) => {
    if (amount <= 0n) return;
    dailyFees.add(token, amount, label);
    const protocolShare = amount * perfFeeBps / MAX_FEE_BPS;
    dailyRevenue.add(token, protocolShare, label);
    dailySupplySideRevenue.add(token, amount - protocolShare, label);
  };

  const deployLogs = await getLogs({
    target: FACTORY,
    eventAbi: ABIS.DeployNewMarket,
    fromBlock: 25094842,
    cacheInCloud: true,
  });
  const troveManagers = deployLogs.map((l: any) => l.trove_manager);
  const lenders = deployLogs.map((l: any) => l.lender);

  if (troveManagers.length === 0) {
    return { dailyFees, dailyRevenue, dailySupplySideRevenue };
  }

  const borrowTokens = await api.multiCall({ calls: troveManagers, abi: 'address:borrow_token' });
  const precisions = await api.multiCall({ calls: troveManagers, abi: 'uint256:borrow_token_precision' });
  const weightedDebtStart = await fromApi.multiCall({ calls: troveManagers, abi: 'uint256:total_weighted_debt', permitFailure: true });
  const weightedDebtEnd = await toApi.multiCall({ calls: troveManagers, abi: 'uint256:total_weighted_debt', permitFailure: true });
  const performanceFees = await toApi.multiCall({ calls: lenders, abi: 'uint16:performanceFee', permitFailure: true });

  const period = BigInt(endTimestamp - startTimestamp);

  const perfFeeBpsByMarket = troveManagers.map((_: string, i: number) => BigInt(performanceFees[i] ?? 0));

  troveManagers.forEach((_: string, i: number) => {
    const start = BigInt(weightedDebtStart[i] ?? 0);
    const end = BigInt(weightedDebtEnd[i] ?? 0);
    const precision = BigInt(precisions[i]);
    const interest = (start + end) * period / (2n * SECONDS_PER_YEAR * precision);
    splitAndAdd(borrowTokens[i], interest, METRIC.BORROW_INTEREST, perfFeeBpsByMarket[i]);
  });

  const [openLogs, borrowLogs, adjustLogs] = await Promise.all([
    getLogs({ targets: troveManagers, eventAbi: ABIS.OpenTrove, flatten: false }),
    getLogs({ targets: troveManagers, eventAbi: ABIS.Borrow, flatten: false }),
    getLogs({ targets: troveManagers, eventAbi: ABIS.AdjustInterestRate, flatten: false }),
  ]);

  openLogs.forEach((logs: any[], i: number) => {
    logs.forEach((log: any) => splitAndAdd(borrowTokens[i], BigInt(log.upfront_fee), METRICS.BorrowOpeningFee, perfFeeBpsByMarket[i]));
  });
  borrowLogs.forEach((logs: any[], i: number) => {
    logs.forEach((log: any) => splitAndAdd(borrowTokens[i], BigInt(log.upfront_fee), METRICS.BorrowOpeningFee, perfFeeBpsByMarket[i]));
  });
  adjustLogs.forEach((logs: any[], i: number) => {
    logs.forEach((log: any) => splitAndAdd(borrowTokens[i], BigInt(log.upfront_fee), METRICS.RateAdjustmentFee, perfFeeBpsByMarket[i]));
  });

  return { dailyFees, dailyRevenue, dailySupplySideRevenue };
};

const methodology = {
  Fees: 'Borrow interest paid by borrowers on outstanding debt, plus upfront fees charged on opening or increasing a Trove and on premature interest-rate adjustments.',
  Revenue: 'Performance fee retained by the protocol, read live from each market\'s lender vault.',
  SupplySideRevenue: 'Remaining fees distributed to lenders.',
};

const breakdownMethodology = {
  Fees: {
    [METRIC.BORROW_INTEREST]: 'Continuous interest paid by borrowers, computed from each market\'s total weighted debt over the window.',
    [METRICS.BorrowOpeningFee]: 'Upfront fee paid when opening a Trove or borrowing more debt (≈ one week of average market interest).',
    [METRICS.RateAdjustmentFee]: 'Upfront fee paid when adjusting a Trove interest rate before the cooldown period elapses.',
  },
  Revenue: {
    [METRIC.BORROW_INTEREST]: 'Protocol share of borrow interest, taken as the lender vault performance fee.',
    [METRICS.BorrowOpeningFee]: 'Protocol share of opening upfront fees, taken as the lender vault performance fee.',
    [METRICS.RateAdjustmentFee]: 'Protocol share of rate-adjustment fees, taken as the lender vault performance fee.',
  },
  SupplySideRevenue: {
    [METRIC.BORROW_INTEREST]: 'Lender share of borrow interest after the performance fee.',
    [METRICS.BorrowOpeningFee]: 'Lender share of opening upfront fees after the performance fee.',
    [METRICS.RateAdjustmentFee]: 'Lender share of rate-adjustment fees after the performance fee.',
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ETHEREUM],
  start: '2026-05-14',
  methodology,
  breakdownMethodology,
};

export default adapter;
