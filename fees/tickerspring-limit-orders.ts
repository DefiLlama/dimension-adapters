import { ChainApi } from '@defillama/sdk';
import { FetchOptions, SimpleAdapter } from '../adapters/types';
import { CHAIN } from '../helpers/chains';

// TickerSpring Limit Orders: Uniswap v4 hooks that hold resting orders as band liquidity and settle
// crossed bands inside the filling swap. https://tickerspring.com/docs#contracts
// Earlier deployments still settle their orders, so every deployment stays tracked.
const HOOKS = [
  '0xb6Ae760feDaE902d735Ec609076cA7de837D8040', // first release (100-tick bands)
  '0x1CB37AEB18e9e92d8a1308218E43FfE1568D0040', // 10-tick bands
  '0xa31729621a2280C0Ff9Aaff5B3F357cFF1bEC040', // current: 10-tick bands, 95% automatic completion
];
// Every market pairs a token with USDG: markets open against MarketProfile.quote (USDG).
const USDG = '0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168';

const COMMISSION = 'Limit Order Commission';
const LP_FEES = 'Limit Order LP Fees';
const COMMISSION_TO_TREASURY = 'Limit Order Commission To Treasury';
const LP_FEES_TO_TREASURY = 'Limit Order LP Fees To Treasury';
const LP_FEES_TO_MAKERS = 'Limit Order LP Fees To Order Makers';

const EVENTS = {
  // Creation-time partial fill ("correction"): commission is charged in the output currency.
  corrected: 'event Corrected(uint256 indexed id, uint256 input, uint256 grossOutput, uint256 commission, uint256 netOutput, uint16 carry, uint160 price)',
  // Order settlement (filled or cancelled): LP fees earned by the order and the commission on
  // those fees plus the converted principal, in each currency.
  accounted: 'event Accounted(uint256 indexed id, bool cancelled, uint256 principal0, uint256 principal1, uint256 fee0, uint256 fee1, uint256 commission0, uint256 commission1)',
};
const ABI = {
  getOrder: 'function getOrder(uint256 id) view returns ((address owner, bytes32 bucket, uint128 liquidity, uint16 feeBps, uint16 commissionCarry, uint8 state, uint256 entry0, uint256 entry1, uint256 debit, uint128 correctionInput, uint128 correctionNet, uint256 net0, uint256 net1))',
  getBucket: 'function getBucket(bytes32 id) view returns ((bytes32 pool, int24 lower, int24 upper, bool sell0, uint8 state, uint128 members, uint128 liquidity, uint128 finalLiquidity, uint256 index0, uint256 index1, uint256 feeReserve0, uint256 feeReserve1, uint128 principal0, uint128 principal1, uint128 principalReserve0, uint128 principalReserve1))',
  getPoolConfig: 'function getPoolConfig(bytes32 id) view returns ((address currency0, address currency1, uint24 fee, int24 tickSpacing, address hooks) key, int24 width, uint128 minimum0, uint128 minimum1, bool supported, uint16 maxLevels)',
};

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const [corrected, accounted] = await Promise.all([
    options.getLogs({ targets: HOOKS, eventAbi: EVENTS.corrected, flatten: false }),
    options.getLogs({ targets: HOOKS, eventAbi: EVENTS.accounted, flatten: false }),
  ]);
  const events = HOOKS.flatMap((hook, i) => [
    ...corrected[i].map((log: any) => ({ hook, log, corrected: true })),
    ...accounted[i].map((log: any) => ({ hook, log, corrected: false })),
  ]);
  if (!events.length) return { dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue.clone(), dailySupplySideRevenue };

  // Owner, band and pool fields never change once an order exists, so latest state equals the state
  // at the event. Robinhood Chain's public RPC does not serve historical state.
  const api = new ChainApi({ chain: options.chain });
  const orders = await api.multiCall({ abi: ABI.getOrder, calls: events.map(({ hook, log }) => ({ target: hook, params: [log.id] })) });
  const bucketKeys = [...new Set(events.map((e, i) => `${e.hook}:${orders[i].bucket}`))];
  const buckets = await api.multiCall({ abi: ABI.getBucket, calls: bucketKeys.map(k => ({ target: k.split(':')[0], params: [k.split(':')[1]] })) });
  const bucketOf = Object.fromEntries(bucketKeys.map((k, i) => [k, buckets[i]]));
  const poolKeys = [...new Set(bucketKeys.map(k => `${k.split(':')[0]}:${bucketOf[k].pool}`))];
  const pools = await api.multiCall({ abi: ABI.getPoolConfig, calls: poolKeys.map(k => ({ target: k.split(':')[0], params: [k.split(':')[1]] })) });
  const poolOf = Object.fromEntries(poolKeys.map((k, i) => [k, pools[i].key]));

  events.forEach(({ hook, log, corrected }, i) => {
    const order = orders[i];
    if (order.owner === '0x0000000000000000000000000000000000000000') throw new Error(`TickerSpring: unknown order ${hook}:${log.id}`);
    const band = bucketOf[`${hook}:${order.bucket}`];
    const key = poolOf[`${hook}:${band.pool}`];
    const usdgIs0 = key.currency0.toLowerCase() === USDG.toLowerCase();
    if (!usdgIs0 && key.currency1.toLowerCase() !== USDG.toLowerCase()) throw new Error(`TickerSpring: pool without USDG ${hook}:${band.pool}`);
    // Long-tail tokens are valued on their USDG side. A band converts at its geometric-mean price,
    // 1.0001^((lower + upper) / 2) raw currency1 per raw currency0; bands are 10 or 100 ticks wide.
    const price = Math.pow(1.0001, (Number(band.lower) + Number(band.upper)) / 2);
    const inUsdg = (amount: bigint, currency0: boolean) => {
      if (currency0 === usdgIs0) return amount;
      return BigInt(Math.floor(currency0 ? Number(amount) * price : Number(amount) / price));
    };
    if (corrected) {
      // The correction's own swap price: input and grossOutput are in the two currencies of the pool.
      const outputIsUsdg = band.sell0 ? !usdgIs0 : usdgIs0;
      const commission = BigInt(log.commission);
      const value = outputIsUsdg ? commission : commission * BigInt(log.input) / BigInt(log.grossOutput);
      dailyFees.add(USDG, value, COMMISSION);
      dailyRevenue.add(USDG, value, COMMISSION_TO_TREASURY);
      return;
    }
    const bps = BigInt(order.feeBps);
    for (const currency0 of [true, false]) {
      const lpFees = BigInt(currency0 ? log.fee0 : log.fee1);
      const commission = BigInt(currency0 ? log.commission0 : log.commission1);
      // The hook charges feeBps on LP fees plus converted principal; carry adds at most one raw unit.
      const lpCommission = lpFees * bps / 10000n;
      dailyFees.add(USDG, inUsdg(commission - lpCommission, currency0), COMMISSION);
      dailyFees.add(USDG, inUsdg(lpFees, currency0), LP_FEES);
      dailyRevenue.add(USDG, inUsdg(commission - lpCommission, currency0), COMMISSION_TO_TREASURY);
      dailyRevenue.add(USDG, inUsdg(lpCommission, currency0), LP_FEES_TO_TREASURY);
      dailySupplySideRevenue.add(USDG, inUsdg(lpFees - lpCommission, currency0), LP_FEES_TO_MAKERS);
    }
  });
  return { dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue.clone(), dailySupplySideRevenue };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  // Order LP fees are also Uniswap v4 LP fees on Robinhood Chain (dexs/uniswap-v4).
  doublecounted: true,
  chains: [CHAIN.ROBINHOOD],
  start: '2026-09-21',
  fetch,
  methodology: {
    Fees: 'Commission paid by limit-order makers (2.5% of converted proceeds and of the LP fees their orders earn) plus the Uniswap v4 LP fees earned by resting order liquidity, booked when an order is settled or partially filled at creation. Amounts in other tokens are valued on the USDG side at the order band\'s own execution price.',
    Revenue: 'All commission, paid to the TickerSpring treasury.',
    ProtocolRevenue: 'All commission, paid to the TickerSpring treasury.',
    SupplySideRevenue: 'LP fees earned by order liquidity, net of commission, credited to order makers.',
  },
  breakdownMethodology: {
    Fees: {
      [COMMISSION]: 'Commission on the proceeds of filled orders, including partial fills at creation (2.5%, snapshotted per order).',
      [LP_FEES]: 'Uniswap v4 LP fees earned by resting order liquidity while the pool price moved through its band.',
    },
    Revenue: {
      [COMMISSION_TO_TREASURY]: 'Commission on order proceeds, paid to the TickerSpring treasury.',
      [LP_FEES_TO_TREASURY]: 'Commission on LP fees earned by orders (2.5%), paid to the TickerSpring treasury.',
    },
    ProtocolRevenue: {
      [COMMISSION_TO_TREASURY]: 'Commission on order proceeds, paid to the TickerSpring treasury.',
      [LP_FEES_TO_TREASURY]: 'Commission on LP fees earned by orders (2.5%), paid to the TickerSpring treasury.',
    },
    SupplySideRevenue: {
      [LP_FEES_TO_MAKERS]: 'LP fees earned by orders minus commission, credited to order makers.',
    },
  },
};

export default adapter;
