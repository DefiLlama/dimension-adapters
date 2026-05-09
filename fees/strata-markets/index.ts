import { FetchOptions, SimpleAdapter } from '../../adapters/types';
import { CHAIN } from '../../helpers/chains';

const ACCOUNTING = '0xa436c5Dd1Ba62c55D112C10cd10E988bb3355102';
const USDE = '0x4c9EDD5852cd905f086C759E8383e09bff1E68B3';
const CDO = '0x908B3921aaE4fC17191D382BB61020f2Ee6C0e20';
const JRT = '0xC58D044404d8B14e953C115E67823784dEA53d8F';
const SRT = '0x3d7d6fdf07EE548B939A80edbc9B2256d0cdc003';

const NUSD_ACCOUNTING = '0x5eFE7C9DA88568709E98b237D4D946aFbDA2aA52';
const NUSD = '0xE556ABa6fe6036275Ec1f87eda296BE72C811BCE';
const NUSD_CDO = '0x7b6c960cf185fb27ECb91c174FAe065978beDd10';
const NUSD_JRT = '0xFC807058A352b61aEef6A38e2D0fC3990225E772';
const NUSD_SRT = '0x65a44528e8868166401eA08b549E19552af589dB';

const MHYPER_ACCOUNTING = '0xAf32D44D510B82b64f13602f4A22c6A7FfF2b228';
const USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
const MHYPER_CDO = '0x39C7E67b25fB14eAec8717B20664C2E35327e6cf';
const MHYPER_JRT = '0xEb205d26E9E605Ec82d1C0d652E00037C278714b';
const MHYPER_SRT = '0x627EA69929212916Ec57B1b26d2E1a19F6129B53';

const MM1USD_ACCOUNTING = '0xE4A3A21Cf73a8F34fc7f45D7FcE99c569AbB2A4A';
const MM1USD = '0xCc5C22C7A6BCC25e66726AeF011dDE74289ED203';
const MM1USD_CDO = '0x613D1790d9BA381D27B4071C04380Db8ED120E5f';
const MM1USD_JRT = '0xf7eB8dfec75C42D2d2247FE76Ccaedc59f821688';
const MM1USD_SRT = '0xCcEd21d609CaC4A272d0c01a8FF4de9cEBc40d60';

const SATURN_ACCOUNTING = '0x180f7b3b807FA91EDb6e864802e4664D6Ee8Cf88';
const USDATSAT = '0x23238f20b894f29041f48D88eE91131C395Aaa71';
const SATURN_CDO = '0xa617763cEB808f43eC9D532cbE8C65819afb846b';
const SATURN_JRT = '0x011e55d2b28306458e37Ca7E997C879BB25A455D';
const SATURN_SRT = '0xFaa9a0e1Db9E22AE3A20B2B58a68DC24D053d066';

const FEE_ACCRUED_EVENT = "event FeeAccrued(bool isJrt, uint256 amountToReserve, uint256 amountToTranche)";
const RESERVE_REDUCED_EVENT = "event ReserveReduced(address token, uint256 amount)";
const RESERVE_DISTRIBUTED_EVENT = "event ReserveDistributed(uint256 jrtAmount, uint256 srtAmount)";
const DEPOSIT_EVENT = "event Deposit(address indexed sender, address indexed owner, uint256 assets, uint256 shares)";
const WITHDRAW_EVENT = "event Withdraw(address indexed sender, address indexed receiver, address indexed owner, uint256 assets, uint256 shares)";

interface TokenConfig {
  accounting: string;
  token: string;
  cdo: string;
  jrt: string;
  srt: string;
  decimals: number;
  startTimestamp: number;
}

const USDE_CONFIG: TokenConfig = { accounting: ACCOUNTING, token: USDE, cdo: CDO, jrt: JRT, srt: SRT, decimals: 18, startTimestamp: 0 };
const NUSD_CONFIG: TokenConfig = { accounting: NUSD_ACCOUNTING, token: NUSD, cdo: NUSD_CDO, jrt: NUSD_JRT, srt: NUSD_SRT, decimals: 18, startTimestamp: 1770359700 };
const MHYPER_CONFIG: TokenConfig = { accounting: MHYPER_ACCOUNTING, token: USDC, cdo: MHYPER_CDO, jrt: MHYPER_JRT, srt: MHYPER_SRT, decimals: 6, startTimestamp: 1775055426 };
const MM1USD_CONFIG: TokenConfig = { accounting: MM1USD_ACCOUNTING, token: MM1USD, cdo: MM1USD_CDO, jrt: MM1USD_JRT, srt: MM1USD_SRT, decimals: 18, startTimestamp: 1775919426 };
const SATURN_CONFIG: TokenConfig = { accounting: SATURN_ACCOUNTING, token: USDATSAT, cdo: SATURN_CDO, jrt: SATURN_JRT, srt: SATURN_SRT, decimals: 6, startTimestamp: 1777788984 };

async function computeMetrics(options: FetchOptions, config: TokenConfig) {
  let redemptionFeesTotal = 0;
  let redemptionFeesReserve = 0;
  let totalDeposits = 0;
  let totalWithdrawals = 0;

  const [
    navStart, navEnd, reserveNavStart, reserveNavEnd,
    depositLogs, withdrawLogs, reserveReducedLogs, reserveDistributedLogs, feeLogs,
  ] = await Promise.all([
    options.fromApi.call({ target: config.accounting, abi: "function nav() view returns (uint256)" }),
    options.toApi.call({ target: config.accounting, abi: "function nav() view returns (uint256)" }),
    options.fromApi.call({ target: config.accounting, abi: "function reserveNav() view returns (uint256)" }).catch(() => '0'),
    options.toApi.call({ target: config.accounting, abi: "function reserveNav() view returns (uint256)" }).catch(() => '0'),
    options.getLogs({ targets: [config.jrt, config.srt], eventAbi: DEPOSIT_EVENT }),
    options.getLogs({ targets: [config.jrt, config.srt], eventAbi: WITHDRAW_EVENT }),
    options.getLogs({ target: config.cdo, eventAbi: RESERVE_REDUCED_EVENT }),
    options.getLogs({ target: config.cdo, eventAbi: RESERVE_DISTRIBUTED_EVENT }),
    options.getLogs({ target: config.accounting, eventAbi: FEE_ACCRUED_EVENT }),
  ]);

  // User flows — Withdraw event emits baseAssets (NET received by user),
  // which equals what the strategy actually paid out (fee stays in strategy).
  for (const log of depositLogs) totalDeposits += Number(log.assets);
  for (const log of withdrawLogs) totalWithdrawals += Number(log.assets);
  const netUserFlows = totalDeposits - totalWithdrawals;

  // Reserve reductions sent to treasury. Token amounts converted to USD;
  // valid approximation for pegged stablecoins (USDe/NUSD ≈ $1).
  const totalReserveReductions = options.createBalances();
  for (const log of reserveReducedLogs) totalReserveReductions.add(log.token, log.amount);
  const totalReserveReductionsUSD = await totalReserveReductions.getUSDValue();
  const totalReserveReductionsBaseAssets = totalReserveReductionsUSD * 10 ** config.decimals;

  // Reserve distributed to tranches (already in base asset units from accounting).
  let distributeReserveTotal = 0;
  for (const log of reserveDistributedLogs) {
    distributeReserveTotal += Number(log.jrtAmount) + Number(log.srtAmount);
  }

  // Redemption fees from FeeAccrued events (in base asset units).
  for (const log of feeLogs) {
    const toReserve = Number(log.amountToReserve);
    const toTranche = Number(log.amountToTranche);
    redemptionFeesTotal += toReserve + toTranche;
    redemptionFeesReserve += toReserve;
  }
  const redemptionFeesTranche = redemptionFeesTotal - redemptionFeesReserve;

  // Strategy yield:
  // navEnd = navStart + strategyYield + deposits - withdrawals(net) - reserveReductionsToTreasury
  // note: distributeReserve does not change accounting.nav (reserve moves to tranches within accounting)
  const deltaNav = Number(navEnd) - Number(navStart);
  const strategyYield = deltaNav - netUserFlows + totalReserveReductionsBaseAssets;

  // Performance fee via reserve-diff:
  // reserveNavEnd = reserveNavStart + perfFee + redemptionFeesToReserve
  //               - reserveReductionsToTreasury - distributeReserveToTranches
  // => perfFee = deltaReserveNav + reserveReductionsToTreasury + distributeReserveToTranches - redemptionFeesToReserve
  const deltaReserveNav = Number(reserveNavEnd) - Number(reserveNavStart);
  const perfFee = Math.max(0,
    deltaReserveNav + totalReserveReductionsBaseAssets + distributeReserveTotal - redemptionFeesReserve
  );

  const totalFees = strategyYield + redemptionFeesTotal;
  const protocolRevenue = perfFee + redemptionFeesReserve;
  const totalRevenue = perfFee + redemptionFeesReserve;
  const supplySideRevenue = strategyYield - perfFee + redemptionFeesTranche;

  return { totalFees, totalRevenue, protocolRevenue, supplySideRevenue };
}

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const configs = [USDE_CONFIG, NUSD_CONFIG, MHYPER_CONFIG, MM1USD_CONFIG, SATURN_CONFIG].filter(c => options.startOfDay >= c.startTimestamp);
  const results = await Promise.all(configs.map(c => computeMetrics(options, c)));

  for (let i = 0; i < configs.length; i++) {
    const { token } = configs[i];
    const { totalFees, totalRevenue, protocolRevenue, supplySideRevenue } = results[i];
    dailyFees.add(token, totalFees);
    dailyRevenue.add(token, totalRevenue);
    dailyProtocolRevenue.add(token, protocolRevenue);
    dailySupplySideRevenue.add(token, supplySideRevenue);
  }

  return { dailyFees, dailyRevenue, dailyProtocolRevenue, dailySupplySideRevenue };
};

const methodology = {
  Fees: "Includes yield generated on deposited assets and redemption fees charged by Strata.",
  Revenue: "Protocol revenue consists of performance fees (5-10%) charged by Strata on the yield generated and redemption fees paid by the users.",
  ProtocolRevenue: "Protocol revenue consists of performance and redemption fees collected by Strata, including the portion of fees shared with reserve.",
  SupplySideRevenue: "Net yield distributed to tranches (after performance fees) plus the portion of redemption fees that remain in the tranche.",
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ETHEREUM],
  start: '2025-10-05',
  methodology,
  allowNegativeValue: true,
};

export default adapter;
