import { FetchOptions, SimpleAdapter } from '../../adapters/types';
import { CHAIN } from '../../helpers/chains';

const ACCOUNTING = '0xa436c5Dd1Ba62c55D112C10cd10E988bb3355102';
const USDE = '0x4c9EDD5852cd905f086C759E8383e09bff1E68B3';
const CDO = '0x908B3921aaE4fC17191D382BB61020f2Ee6C0e20';
const JRT = '0xC58D044404d8B14e953C115E67823784dEA53d8F';
const SRT = '0x3d7d6fdf07EE548B939A80edbc9B2256d0cdc003';
const WAD = 1e18;

const NUSD_ACCOUNTING = '0x5eFE7C9DA88568709E98b237D4D946aFbDA2aA52';
const NUSD = '0xE556ABa6fe6036275Ec1f87eda296BE72C811BCE';
const NUSD_CDO = '0x7b6c960cf185fb27ECb91c174FAe065978beDd10';
const NUSD_JRT = '0xFC807058A352b61aEef6A38e2D0fC3990225E772';
const NUSD_SRT = '0x65a44528e8868166401eA08b549E19552af589dB';

// Events
const FEE_ACCRUED_EVENT = "event FeeAccrued(bool isJrt, uint256 amountToReserve, uint256 amountToTranche)";
const RESERVE_REDUCED_EVENT = "event ReserveReduced(address token, uint256 amount)";
const DEPOSIT_EVENT = "event Deposit(address indexed sender, address indexed owner, uint256 assets, uint256 shares)";
const WITHDRAW_EVENT = "event Withdraw(address indexed sender, address indexed receiver, address indexed owner, uint256 assets, uint256 shares)";

interface TokenConfig {
  accounting: string;
  token: string;
  cdo: string;
  jrt: string;
  srt: string;
  startTimestamp: number;
}

const USDE_CONFIG: TokenConfig = { accounting: ACCOUNTING, token: USDE, cdo: CDO, jrt: JRT, srt: SRT, startTimestamp: 0 };
const NUSD_CONFIG: TokenConfig = { accounting: NUSD_ACCOUNTING, token: NUSD, cdo: NUSD_CDO, jrt: NUSD_JRT, srt: NUSD_SRT, startTimestamp: 1770359700 };

async function computeMetrics(options: FetchOptions, config: TokenConfig) {
  let redemptionFeesTotal = 0;
  let redemptionFeesReserve = 0;
  let totalDeposits = 0;
  let totalWithdrawals = 0;

  // 1. Get NAV (TVL) and ReserveBps
  const [navStart, navEnd, reserveBps] = await Promise.all([
    options.fromApi.call({ target: config.accounting, abi: "function nav() view returns (uint256)" }),
    options.toApi.call({ target: config.accounting, abi: "function nav() view returns (uint256)" }),
    options.api.call({ target: config.accounting, abi: "function reserveBps() view returns (uint256)" }),
  ]);

  // 2. Get User Flows (Deposits/Withdrawals) to calculate Net Flows
  const vaultAddresses = [config.jrt, config.srt];

  const [depositLogs, withdrawLogs] = await Promise.all([
    options.getLogs({ targets: vaultAddresses, eventAbi: DEPOSIT_EVENT }),
    options.getLogs({ targets: vaultAddresses, eventAbi: WITHDRAW_EVENT }),
  ]);

  for (const log of depositLogs) {
    totalDeposits += Number(log.assets);
  }
  for (const log of withdrawLogs) {
    totalWithdrawals += Number(log.assets);
  }
  const netUserFlows = totalDeposits - totalWithdrawals;

  // 3. Get Admin Flows (Reserve Reductions)
  const reserveLogs = await options.getLogs({
    target: config.cdo,
    eventAbi: RESERVE_REDUCED_EVENT,
  });

  const totalReserveReductions = options.createBalances();

  for (const log of reserveLogs) {
    totalReserveReductions.add(log.token, log.amount);
  }

  // 4. Calculate Gross Underlying Yield
  const deltaNav = Number(navEnd) - Number(navStart);
  const totalReserveReductionsUSD = await totalReserveReductions.getUSDValue();
  const grossYield = deltaNav - netUserFlows + (totalReserveReductionsUSD * WAD);

  // 5. Calculate Fees/Revenue Components
  const performanceFee = grossYield > 0 ? (grossYield * reserveBps) / WAD : 0;

  const feeLogs = await options.getLogs({
    target: config.accounting,
    eventAbi: FEE_ACCRUED_EVENT,
  });

  feeLogs.forEach((log: any) => {
    const toReserve = Number(log.amountToReserve);
    const toTranche = Number(log.amountToTranche);
    redemptionFeesTotal += toReserve + toTranche;
    redemptionFeesReserve += toReserve;
  });

  const redemptionFeesTranche = redemptionFeesTotal - redemptionFeesReserve;

  // 6. Aggregate Metrics
  const totalFees = grossYield + redemptionFeesTotal;
  const protocolRevenue = performanceFee + redemptionFeesReserve;
  const totalRevenue = performanceFee + redemptionFeesReserve;
  const supplySideRevenue = grossYield - performanceFee + redemptionFeesTranche;

  return { totalFees, totalRevenue, protocolRevenue, supplySideRevenue };
}

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const configs = [USDE_CONFIG, NUSD_CONFIG].filter(c => options.startOfDay >= c.startTimestamp);

  const results = await Promise.all(configs.map(c => computeMetrics(options, c)));

  for (let i = 0; i < configs.length; i++) {
    const { token } = configs[i];
    const { totalFees, totalRevenue, protocolRevenue, supplySideRevenue } = results[i];
    dailyFees.add(token, totalFees);
    dailyRevenue.add(token, totalRevenue);
    dailyProtocolRevenue.add(token, protocolRevenue);
    dailySupplySideRevenue.add(token, supplySideRevenue);
  }

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Fees: "Includes yield generated on deposited assets and redemption fees charged by Strata.",
  Revenue: "Protocol revenue consists of performance fees (5-10%) charged by Strata on the yield generated and redemption fees paid by the users. ",
  ProtocolRevenue: "Protocol revenue consists of performance and redemption fees collected by Strata, including the portion of fees shared with reserve.",
  SupplySideRevenue: "Net yield distributed to tranches (after performance fees) plus the portion of redemption fees that remain in the tranche."
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ETHEREUM],
  start: '2025-10-05',
  methodology,
  allowNegativeValue: true,
}

export default adapter;
