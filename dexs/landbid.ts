import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { METRIC } from "../helpers/metrics";
import { CHAIN } from "../helpers/chains";
import ADDRESSES from "../helpers/coreAssets.json"

const OLD_WORLD_MINER = "0xbc25d77953425041C3f09ea4b731a873E00036EA";
const V2_WORLD_MINER = "0x0B28B589Cf3FDfaeF53054D2914fF36D6f1baBCc";
const UNCX_UNVI3_LOCKER = "0x231278eDd38B00B07fBd52120CEf685B9BaEBCC1";
const LAND_WETH_UNIV3_LP = "0xf630370cBFEB1d04c5C7B564143010E8d30b4e10";
const PROTOCOL_LP_PROVIDER = "0x258007980c06Ae309851774cCd703023D91f4879";
const LAND_TOKEN = "0xB738b1568F08B0d6894a580Ef805E9298ebFaB46";

const CONQUER_EVENT =
  "event Conquer(uint8 indexed continentId,address indexed newHolder,address indexed prevHolder,uint256 price,uint256 prevHolderPayout,uint256 tokensAccrued)";

const LP_FEE_COLLECTED_EVENT = "event Collect (address indexed owner, address recipient, int24 indexed tickLower, int24 indexed tickUpper, uint128 amount0, uint128 amount1)"

const BASE_FEE_BPS = 10000n;
const OLD_LP_FEE_BPS = 1000n; // 10%
const OLD_DEV_FEE_BPS = 500n; // 5%
const V2_BUYBACKS_BPS = 1125n; // 11.25%
const V2_STAKING_BPS = 300n; // 3%
const V2_INCENTIVES_BPS = 75n; // 0.75%
const V2_PROTOCOL_REVENUE_BPS = V2_BUYBACKS_BPS + V2_INCENTIVES_BPS; // 12%
const UNCX_FEE_SHARE = 2 / 100; // 2%

const toBigInt = (value: any) => BigInt(value.toString());
const mulBps = (amount: bigint, bps: bigint) => amount * bps / BASE_FEE_BPS;

async function fetch(options: FetchOptions) {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();

  const oldConquerEvents = await options.getLogs({
    target: OLD_WORLD_MINER,
    eventAbi: CONQUER_EVENT,
  });

  for (const log of oldConquerEvents) {
    const price = toBigInt(log.price);
    const protocolFees = mulBps(price, OLD_DEV_FEE_BPS);
    const lpFees = mulBps(price, OLD_LP_FEE_BPS);
    const protocolRevenue = protocolFees + lpFees;

    dailyVolume.addGasToken(price.toString());
    dailyFees.addGasToken(protocolFees.toString(), METRIC.PROTOCOL_FEES);
    dailyFees.addGasToken(lpFees.toString(), "Fees to protocol owned liquidity");
    dailyRevenue.addGasToken(protocolRevenue.toString());
    dailyProtocolRevenue.addGasToken(protocolRevenue.toString());
  }

  const v2ConquerEvents = await options.getLogs({
    target: V2_WORLD_MINER,
    eventAbi: CONQUER_EVENT,
  });

  for (const log of v2ConquerEvents) {
    const price = toBigInt(log.price);
    const prevHolderPayout = toBigInt(log.prevHolderPayout);
    const staking = mulBps(price, V2_STAKING_BPS);
    const protocolAllocation = price - prevHolderPayout;
    const revenue = protocolAllocation;
    const protocolRevenue = revenue - staking;
    const expectedProtocolRevenue = mulBps(price, V2_PROTOCOL_REVENUE_BPS);

    if (staking > revenue) {
      throw new Error(`Land Bid V2 staking distribution exceeds revenue: ${staking} > ${revenue}`);
    }
    if (protocolRevenue < expectedProtocolRevenue) {
      throw new Error(`Land Bid V2 protocol revenue below expected BPS split: ${protocolRevenue} < ${expectedProtocolRevenue}`);
    }

    dailyVolume.addGasToken(price.toString());
    dailyFees.addGasToken(price.toString(), "Conquer payments");
    dailySupplySideRevenue.addGasToken(prevHolderPayout.toString(), "Previous holder payout");
    dailyHoldersRevenue.addGasToken(staking.toString(), "Staking distribution");
    dailyProtocolRevenue.addGasToken(protocolRevenue.toString(), "Buybacks and incentives");
    dailyRevenue.addGasToken(revenue.toString(), "Conquer revenue");
  }

  const lpFeesCollectedLogs = await options.getLogs({
    target: LAND_WETH_UNIV3_LP,
    eventAbi: LP_FEE_COLLECTED_EVENT,
  })

  const token0 = ADDRESSES.base.WETH;
  const token1 = LAND_TOKEN;

  for (const log of lpFeesCollectedLogs) {
    let lpfeeRatioReceivedByProtocol = 0;

    if (log.recipient === UNCX_UNVI3_LOCKER) lpfeeRatioReceivedByProtocol = 1 - UNCX_FEE_SHARE;
    else if (log.recipient === PROTOCOL_LP_PROVIDER) lpfeeRatioReceivedByProtocol = 1;
    else continue;

    dailyFees.addToken(token0, Number(log.amount0) * lpfeeRatioReceivedByProtocol, METRIC.LP_FEES);
    dailyFees.addToken(token1, Number(log.amount1) * lpfeeRatioReceivedByProtocol, METRIC.LP_FEES);
    dailyRevenue.addToken(token0, Number(log.amount0) * lpfeeRatioReceivedByProtocol, METRIC.LP_FEES);
    dailyRevenue.addToken(token1, Number(log.amount1) * lpfeeRatioReceivedByProtocol, METRIC.LP_FEES);
    dailyProtocolRevenue.addToken(token0, Number(log.amount0) * lpfeeRatioReceivedByProtocol, METRIC.LP_FEES);
    dailyProtocolRevenue.addToken(token1, Number(log.amount1) * lpfeeRatioReceivedByProtocol, METRIC.LP_FEES);
  }

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue,
    dailySupplySideRevenue,
    dailyHoldersRevenue,
  };
}

const methodology = {
  Volume: "Includes ETH paid by users when conquering continents in the Land Bid game.",
  Fees: "For V2, includes 100% of Conquer.price paid by users into WorldMiner for the core gameplay action. Historical V1 data is kept under the previous 15% protocol fee methodology.",
  Revenue: "For V2, includes protocol revenue plus holders revenue, equal to 15% of Conquer.price. Historical V1 revenue is kept under the previous adapter methodology.",
  ProtocolRevenue: "For V2, includes 11.25% used for LAND buybacks and 0.75% used for incentives. Historical V1 protocol revenue includes protocol and protocol-owned-liquidity fees.",
  SupplySideRevenue: "For V2, includes the previous holder payout, currently 85% of each Conquer.",
  HoldersRevenue: "For V2, includes the staking distribution, currently 3% of each Conquer.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.PROTOCOL_FEES]: "Historical V1 protocol fee: 5% of the conquer amount.",
    [METRIC.LP_FEES]: "Fees earned by protocol-owned/locked Uniswap V3 liquidity.",
    "Fees to protocol owned liquidity": "Historical V1 protocol-owned-liquidity fee: 10% of the conquer amount.",
    "Conquer payments": "V2: 100% of Conquer.price paid by users into WorldMiner.",
  },
  Revenue: {
    [METRIC.LP_FEES]: "Fees earned by protocol-owned/locked Uniswap V3 liquidity.",
    "Conquer revenue": "V2: protocol revenue plus holders revenue, equal to 15% of Conquer.price.",
  },
  ProtocolRevenue: {
    [METRIC.LP_FEES]: "Fees earned by protocol-owned/locked Uniswap V3 liquidity.",
    "Buybacks and incentives": "V2: 11.25% of Conquer.price used for buybacks plus 0.75% used for incentives.",
  },
  SupplySideRevenue: {
    "Previous holder payout": "V2: 85% of each Conquer paid to the previous continent holder.",
  },
  HoldersRevenue: {
    "Staking distribution": "V2: 3% of each Conquer distributed to the LAND staking contract.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.BASE],
  start: "2026-05-05",
  methodology,
  breakdownMethodology,
};

export default adapter;
