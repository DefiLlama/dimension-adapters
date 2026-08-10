import { Adapter, FetchOptions } from '../../adapters/types';
import { CHAIN } from '../../helpers/chains';
import { METRIC } from '../../helpers/metrics';

const YEAR = 365n * 24n * 60n * 60n;

const chainConfig: Record<string, { vault: string; susdnr: string; decimals: bigint; start: string }> = {
  [CHAIN.FLUENT]: {
    vault: '0x50AE83DBDC44208eDa1Ef722F87Bab0FFB195Eea',
    susdnr: '0xFa9b3B45587f9fcdE14759121C3868C2733DCbf4',
    decimals: 6n,
    start: '2026-04-23',
  },
};

const METRICS = {
  instantRedemptionFees: 'Instant Redemption Fees',
};

// Source: https://docs.nerona.xyz/fees-revenue
const FEE_RATES = {
  management: 0.01, // 1%
  performance: 0.10, // 10%
  instantRedemption: 0.01, // 1%
};

const toScaledRate = (rate: number, scale: bigint) => BigInt(Math.round(rate * Number(scale)));
const FEES = {
  management: toScaledRate(FEE_RATES.management, 10_000n),
  performance: toScaledRate(FEE_RATES.performance, 1_000_000n),
  instantRedemption: toScaledRate(FEE_RATES.instantRedemption, 10_000n),
  bps: 10_000n,
  denominator: 1_000_000n,
};

const toUSD = (amount: bigint, decimals: bigint) => Number(amount) / 10 ** Number(decimals);

const abis = {
  getSharePrice: 'uint256:getSharePrice',
  getTotalAssets: 'uint256:getTotalAssets',
  totalSupply: 'uint256:totalSupply',
  withdraw:
    'event Withdraw(address indexed sender, address indexed receiver, address indexed owner, uint256 assets, uint256 shares)',
};

async function fetch(options: FetchOptions) {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const { vault, susdnr, decimals } = chainConfig[options.chain];

  const [startTotalAssets, startSharePrice, startSupply] = await options.fromApi.batchCall([
    { target: vault, abi: abis.getTotalAssets },
    { target: vault, abi: abis.getSharePrice },
    { target: susdnr, abi: abis.totalSupply },
  ]);

  const [endTotalAssets, endSharePrice, endSupply] = await options.toApi.batchCall([
    { target: vault, abi: abis.getTotalAssets },
    { target: vault, abi: abis.getSharePrice },
    { target: susdnr, abi: abis.totalSupply },
  ]);

  const seconds = BigInt(options.toTimestamp - options.fromTimestamp);
  const avgTotalAssets =
    (BigInt(startTotalAssets.toString()) + BigInt(endTotalAssets.toString())) / 2n;
  const avgSupply = (BigInt(startSupply.toString()) + BigInt(endSupply.toString())) / 2n;
  const sharePriceDelta = BigInt(endSharePrice.toString()) - BigInt(startSharePrice.toString());

  const managementFees = avgTotalAssets * FEES.management * seconds / YEAR / FEES.bps;
  const grossYield = sharePriceDelta > 0n ? sharePriceDelta * avgSupply / (10n ** decimals) : 0n;
  const performanceFees = grossYield * FEES.performance / FEES.denominator;
  const supplySideYield = grossYield - performanceFees;

  const instantRedemptionFees = (await options.getLogs({ target: vault, eventAbi: abis.withdraw })).reduce(
    (sum: bigint, log: any) =>
      sum + (BigInt(log.assets.toString()) * FEES.instantRedemption) / (FEES.bps - FEES.instantRedemption),
    0n,
  );

  dailyFees.addUSDValue(toUSD(grossYield, decimals), METRIC.ASSETS_YIELDS);
  dailySupplySideRevenue.addUSDValue(toUSD(supplySideYield, decimals), METRIC.ASSETS_YIELDS);

  const managementFeesUSD = toUSD(managementFees, decimals);
  dailyFees.addUSDValue(managementFeesUSD, METRIC.MANAGEMENT_FEES);
  dailyRevenue.addUSDValue(managementFeesUSD, METRIC.MANAGEMENT_FEES);
  dailyProtocolRevenue.addUSDValue(managementFeesUSD, METRIC.MANAGEMENT_FEES);

  const performanceFeesUSD = toUSD(performanceFees, decimals);
  dailyRevenue.addUSDValue(performanceFeesUSD, METRIC.PERFORMANCE_FEES);
  dailyProtocolRevenue.addUSDValue(performanceFeesUSD, METRIC.PERFORMANCE_FEES);

  const instantRedemptionFeesUSD = toUSD(instantRedemptionFees, decimals);
  dailyFees.addUSDValue(instantRedemptionFeesUSD, METRICS.instantRedemptionFees);
  dailyRevenue.addUSDValue(instantRedemptionFeesUSD, METRICS.instantRedemptionFees);
  dailyProtocolRevenue.addUSDValue(instantRedemptionFeesUSD, METRICS.instantRedemptionFees);

  return { dailyFees, dailyRevenue, dailyProtocolRevenue, dailySupplySideRevenue };
}

const methodology = {
  Fees: 'Counts yield earned by the sUSDnr vault plus Nerona fees from management, performance, and instant redemptions.',
  Revenue: 'Revenue is the part kept by Nerona: management fees, performance fees, and instant redemption fees.',
  ProtocolRevenue: 'Revenue is the part kept by Nerona: management fees, performance fees, and instant redemption fees.',
  SupplySideRevenue: 'Supply-side revenue is the yield left for sUSDnr holders after performance fees.',
};

const breakdownMethodology = {
  Fees: {
    [METRIC.ASSETS_YIELDS]: 'Yield earned by the sUSDnr vault, based on share price growth and sUSDnr supply.',
    [METRIC.MANAGEMENT_FEES]: '1% yearly fee charged on vault assets.',
    [METRICS.instantRedemptionFees]: '1% fee paid when users redeem instantly. Standard 4-day redemptions have no fee.',
  },
  Revenue: {
    [METRIC.MANAGEMENT_FEES]: 'Management fees retained by Nerona.',
    [METRIC.PERFORMANCE_FEES]: 'Performance fees retained by Nerona.',
    [METRICS.instantRedemptionFees]: 'Instant redemption fees retained by Nerona.',
  },
  ProtocolRevenue: {
    [METRIC.MANAGEMENT_FEES]: 'Management fees retained by Nerona.',
    [METRIC.PERFORMANCE_FEES]: 'Performance fees retained by Nerona.',
    [METRICS.instantRedemptionFees]: 'Instant redemption fees retained by Nerona.',
  },
  SupplySideRevenue: {
    [METRIC.ASSETS_YIELDS]: 'sUSDnr holder yield after performance fees.',
  },
};

const adapter: Adapter = {
  version: 2,
  pullHourly: true,
  fetch,
  adapter: chainConfig,
  methodology,
  breakdownMethodology,
};

export default adapter;
