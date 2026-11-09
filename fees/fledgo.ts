import { FetchOptions, SimpleAdapter } from '../adapters/types';
import { CHAIN } from '../helpers/chains';
import ADDRESSES from '../helpers/coreAssets.json';

// Verified FledgoTaxHook deployments: https://fledgo.fun/docs/contracts
// Fee rules: https://fledgo.fun/docs/trading-and-fees
// Starts are the first observed fee dates (UTC), not the earlier factory deployment dates.
const chainConfig: Record<string, { hook: string; block: number; start: string }> = {
  [CHAIN.BASE]: { hook: '0x25e5bF8aaBE36e5c96394329fb616B7c181420cc', block: 51132377, start: '2026-10-01' },
  [CHAIN.ROBINHOOD]: { hook: '0xFfe22F0ec484e8EE982db0625eBA3F5d4932A0CC', block: 60383041, start: '2026-09-30' },
  [CHAIN.ARC]: { hook: '0x1Dd014D0BC4c3dE0B96976423C7234F69f27E0Cc', block: 21701778, start: '2026-10-01' },
};
const ZERO = ADDRESSES.null;
const ABI = {
  accrued: 'event FeesAccrued(bytes32 indexed poolId,address indexed trader,address indexed referrer,uint256 grossQuote,uint256 totalFee)',
  config: 'function poolConfigs(bytes32) view returns(address launchToken,address quote,uint16 creatorBps,uint16 referralBps,uint16 buybackBps,uint16 totalBps,bool launchTokenIs0,bool taxed,bool registered)',
};

async function fetch(options: FetchOptions) {
  const { hook } = chainConfig[options.chain];
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const logs = await options.getLogs({
    target: hook, eventAbi: ABI.accrued,
  });
  const ids = [...new Set(logs.map(log => log.poolId))];
  const configs = ids.length ? await options.api.multiCall({
    target: hook, abi: ABI.config, calls: ids.map(id => ({ params: [id] })),
  }) : [];
  const pools = new Map(ids.map((id, i) => [id, configs[i]]));

  for (const log of logs) {
    const config = pools.get(log.poolId)!;
    if (!config.registered || !config.taxed) throw new Error(`Fledgo: invalid taxed pool ${log.poolId}`);
    const gross = BigInt(log.grossQuote);
    const total = BigInt(log.totalFee);
    const creator = gross * BigInt(config.creatorBps) / 10000n;
    const buyback = gross * BigInt(config.buybackBps) / 10000n;
    const referral = log.referrer.toLowerCase() === ZERO ? 0n : gross * BigInt(config.referralBps) / 10000n;
    // The contract gives treasury all rounding dust between gross total and creator allocation.
    const treasury = total - creator;
    const recipients = creator - buyback - referral;
    if (total !== gross * BigInt(config.totalBps) / 10000n
      || BigInt(config.totalBps) !== 40n + BigInt(config.creatorBps)
      || recipients < 0n || treasury < 0n)
      throw new Error(`Fledgo: inconsistent fee allocation ${log.poolId}`);

    const add = (balances: typeof dailyFees, amount: bigint, label: string) => {
      if (config.quote.toLowerCase() === ZERO) balances.addGasToken(amount, label);
      else balances.add(config.quote, amount, label);
    };
    add(dailyFees, total, 'Trading fees');
    add(dailyRevenue, treasury, 'Trading fees to treasury');
    add(dailySupplySideRevenue, recipients, 'Trading fees to creator recipients');
    add(dailySupplySideRevenue, referral, 'Trading fees to referrers');
    add(dailySupplySideRevenue, buyback, 'Trading fees to launched-token buybacks');
  }
  return { dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue, dailySupplySideRevenue };
}

const treasuryMethodology = {
  'Trading fees to treasury': 'The immutable 40-bps protocol charge plus integer rounding dust, equal to the emitted total fee minus the gross quote amount times creatorBps floored per swap.',
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  // Fledgo is a Uniswap v4 hook. Only its quote-asset hook charge is counted here;
  // gas, third-party routing and underlying LP fees are excluded.
  doublecounted: true,
  fetch,
  adapter: chainConfig,
  methodology: {
    Fees: 'Actual quote-asset swap charges emitted by the verified TaxHook FeesAccrued event. V1 launches charge no trading tax. No token mint allocation, gas, deposits, claim payments or buyback execution is counted as a new fee.',
    Revenue: 'Treasury allocation of each fee on an accrual basis; excludes creators, referrers and launched-token buybacks.',
    ProtocolRevenue: 'The same treasury allocation as Revenue. Fledgo has no own-token holder revenue.',
    SupplySideRevenue: 'Creator recipients, attributed referrers and launched-token buyback allocations. Missing referrers retain their allocation for creators. Buybacks benefit the launched token, not a Fledgo governance token.',
  },
  breakdownMethodology: {
    Fees: { 'Trading fees': 'Exact totalFee in FeesAccrued, denominated in that registered pool configuration quote asset. Native ETH and native Arc USDC are 18-decimal raw amounts; ERC-20 quotes retain their own decimals. USD totals depend on DefiLlama historical price coverage.' },
    Revenue: treasuryMethodology,
    ProtocolRevenue: treasuryMethodology,
    SupplySideRevenue: {
      'Trading fees to creator recipients': 'Per-swap gross quote times immutable creatorBps, minus buyback allocation and referral allocation only when the event names a nonzero referrer.',
      'Trading fees to referrers': 'Per-swap gross quote times referralBps floored, only for an authenticated nonzero FeesAccrued referrer. Later claims are excluded.',
      'Trading fees to launched-token buybacks': 'Per-swap gross quote times buybackBps floored; later buybacks and burns settle this allocation and are not new fees or protocol-holder revenue.',
    },
  },
};

export default adapter;
