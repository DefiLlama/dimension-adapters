import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryDuneSql } from "../helpers/dune";
import { METRIC } from "../helpers/metrics";

const POSITION_VAULT = "0xd8dc5d42c13b8257b97417e89c118cc46056c117";
const LIQUIDATION_VAULT = "0x8d9db733cfbe8a0da96cb0383233665e93a4caeb";
// Divide in BigInt space to micro-dollars first, then float — avoids both BigInt truncation and float overflow
const toUSD = (raw: bigint) => Number(raw / 1_000_000_000_000_000_000_000_000n) / 1e6;
// Fee split changed on 2024-10-16:
// Before: Stakers 15% + MOLTEN burn 50% + Dev 15% + USDM 20%
// After:  Stakers 15% + MOLTEN burn 20% + Dev 15% + USDM 50%
const SPLIT_TIMESTAMP = new Date("2024-10-16").getTime() / 1000;

const abs = (n: bigint) => (n < 0n ? -n : n);

const fetch = async (options: FetchOptions) => {
  const [increaseLogs, decreaseLogs, closeLogs, liquidateLogs] = await Promise.all([
    options.getLogs({
      target: POSITION_VAULT,
      eventAbi: "event IncreasePosition(uint256 indexed posId, address indexed account, uint256 indexed tokenId, bool isLong, uint256[5] posData)",
    }),
    options.getLogs({
      target: POSITION_VAULT,
      eventAbi: "event DecreasePosition(uint256 indexed posId, address indexed account, uint256 indexed tokenId, bool isLong, int256[3] pnlData, uint256[5] posData)",
    }),
    options.getLogs({
      target: POSITION_VAULT,
      eventAbi: "event ClosePosition(uint256 indexed posId, address indexed account, uint256 indexed tokenId, bool isLong, int256[3] pnlData, uint256[5] posData)",
    }),
    options.getLogs({
      target: LIQUIDATION_VAULT,
      eventAbi: "event LiquidatePosition(uint256 indexed posId, address indexed account, uint256 indexed tokenId, bool isLong, int256[3] pnlData, uint256[5] posData)",
    }),
  ]);

  let feeRaw = BigInt(0);
  let liquidationFeeRaw = BigInt(0);
  let borrowFeeRaw = BigInt(0);

  for (const log of [...increaseLogs, ...decreaseLogs, ...closeLogs])
    feeRaw += BigInt(log.posData[4]);

  for (const log of liquidateLogs)
    liquidationFeeRaw += abs(BigInt(log.posData[0])) / 10n;

  for (const log of [...decreaseLogs, ...closeLogs, ...liquidateLogs])
    borrowFeeRaw += abs(BigInt(log.pnlData[2]));

  const feeUSD = toUSD(feeRaw);
  const liquidationFeeUSD = toUSD(liquidationFeeRaw);
  const borrowFeeUSD = toUSD(borrowFeeRaw);
  let hlFeesUSD = 0;
  try {
    const hlRows = await queryDuneSql(options, `
      SELECT fees FROM dune.supakawaiidesu.dataset_daily_stats
      WHERE date = DATE '${options.dateString}'
    `);
    hlFeesUSD = Number(hlRows?.[0]?.fees ?? 0);
  } catch { /* dataset ended 2025-11-08 */ }

  const after = options.startTimestamp >= SPLIT_TIMESTAMP;
  // Fee split changed on 2024-10-16:
  // Before: USD.m 20% + MOLTEN burn 50% + stakers 15% + dev 15%
  // After:  USD.m 50% + MOLTEN burn 20% + stakers 15% + dev 15%
  const totalFeesUSD = feeUSD + liquidationFeeUSD + borrowFeeUSD + hlFeesUSD;

  const usdmPool   = totalFeesUSD * (after ? 0.50 : 0.20);
  const moltenBurn = totalFeesUSD * (after ? 0.20 : 0.50);
  const stakers    = totalFeesUSD * 0.15;
  const devFund    = totalFeesUSD * 0.15;

  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  dailyFees.addUSDValue(feeUSD, METRIC.OPEN_CLOSE_FEES);
  dailyFees.addUSDValue(liquidationFeeUSD, METRIC.LIQUIDATION_FEES);
  dailyFees.addUSDValue(borrowFeeUSD, METRIC.MARGIN_FEES);
  dailyFees.addUSDValue(hlFeesUSD, 'Hyperliquid Referral Income');

  dailyRevenue.addUSDValue(stakers, METRIC.STAKING_REWARDS);
  dailyRevenue.addUSDValue(moltenBurn, METRIC.TOKEN_BUY_BACK);
  dailyRevenue.addUSDValue(devFund, 'Dev Fund');

  dailySupplySideRevenue.addUSDValue(usdmPool, METRIC.LP_FEES);

  dailyHoldersRevenue.addUSDValue(stakers, METRIC.STAKING_REWARDS);
  dailyHoldersRevenue.addUSDValue(moltenBurn, METRIC.TOKEN_BUY_BACK);

  dailyProtocolRevenue.addUSDValue(devFund, 'Dev Fund');

  return {
    dailyFees,
    dailyRevenue,
    dailyHoldersRevenue,
    dailyProtocolRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Fees: "All fees collected: open/close/liquidation/borrow fees and Hyperliquid referral income.",
  Revenue: "Fees retained by the protocol for staker rewards, MOLTEN burn, and dev fund share.",
  HoldersRevenue: "Staker rewards and MOLTEN burn allocation.",
  ProtocolRevenue: "Fees retained for the development fund.",
  SupplySideRevenue: "Fees distributed to USDM liquidity providers.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.OPEN_CLOSE_FEES]: "Position open/close fees charged on each trade.",
    [METRIC.LIQUIDATION_FEES]: "10% of collateral charged on liquidated positions.",
    [METRIC.MARGIN_FEES]: "Borrow fees paid by traders for holding leveraged positions.",
    ['Hyperliquid Referral Income']: "Referral fees earned by UniDex from Hyperliquid.",
  },
  HoldersRevenue: {
    [METRIC.STAKING_REWARDS]: "15% of all fees distributed to MOLTEN stakers.",
    [METRIC.TOKEN_BUY_BACK]: "20% (post Oct-2024) or 50% (pre Oct-2024) of fees used to buy back and burn MOLTEN.",
  },
  ProtocolRevenue: {
    'Dev Fund': "15% of all fees allocated to the UniDex development fund.",
  },
  SupplySideRevenue: {
    [METRIC.LP_FEES]: "50% (post Oct-2024) or 20% (pre Oct-2024) of all fees added to the USD.m vault.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.ARBITRUM],
  start: '2024-09-20',
  methodology,
  breakdownMethodology,
  dependencies: [Dependencies.DUNE],
  isExpensiveAdapter: true,
};

export default adapter;
