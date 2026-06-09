import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";

const POSITION_MANAGER_FACTORY = "0x8e0667429d1717b3e5fe783a6c472d6d901fe5fa";
const FACTORY_DEPLOY_BLOCK = 24844184;

const Abis = {
  PositionManagerCreated: "event PositionManagerCreated(address indexed positionManager, address indexed owner, address indexed collateralAsset, address debtAsset, uint256 ltv, address transferGuard)",
  totalAssets: "uint256:totalAssets",
  assets: "function assets() view returns (address collateralAsset, address debtAsset)",
  feeData: "function feeData() view returns (address feeRecipient, uint24 managementFee, uint24 performanceFee, uint256 lastTotalAssets, uint40 lastFeeAccrualTimestamp)",
};

const BPS = BigInt(10000);
const SECONDS_PER_YEAR = BigInt(365 * 24 * 60 * 60);

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const factoryLogs = await options.getLogs({
    target: POSITION_MANAGER_FACTORY,
    eventAbi: Abis.PositionManagerCreated,
    fromBlock: FACTORY_DEPLOY_BLOCK,
    cacheInCloud: true,
  });

  const positionManagers = factoryLogs.map((log: any) => log.positionManager);
  if (positionManagers.length === 0) return { dailyFees, dailyRevenue: dailyFees };

  const [assetsResults, assetsBefore, assetsAfter, feeDataResults] = await Promise.all([
    options.api.multiCall({
      abi: Abis.assets,
      calls: positionManagers,
      permitFailure: true,
    }),
    options.fromApi.multiCall({
      abi: Abis.totalAssets,
      calls: positionManagers,
      permitFailure: true,
    }),
    options.toApi.multiCall({
      abi: Abis.totalAssets,
      calls: positionManagers,
      permitFailure: true,
    }),
    options.api.multiCall({
      abi: Abis.feeData,
      calls: positionManagers,
      permitFailure: true,
    }),
  ]);
  const elapsed = BigInt(options.toTimestamp - options.fromTimestamp);

  for (let i = 0; i < positionManagers.length; i++) {
    const assets = assetsResults[i];
    const totalAssetsBefore = assetsBefore[i];
    const totalAssetsAfter = assetsAfter[i];
    const feeData = feeDataResults[i];
    if (!assets || !totalAssetsAfter || !feeData) continue;

    if (BigInt(totalAssetsAfter) <= BigInt(0)) continue;

    const debtAsset = assets.debtAsset;
    const managementFee = BigInt(feeData.managementFee);
    const performanceFee = BigInt(feeData.performanceFee);

    // management fee
    const managementFeeAmount = BigInt(totalAssetsAfter) * managementFee * elapsed / (BPS * SECONDS_PER_YEAR);

    if (managementFeeAmount > BigInt(0)) {
      dailyFees.add(debtAsset, managementFeeAmount, METRIC.MANAGEMENT_FEES);
      dailyRevenue.add(debtAsset, managementFeeAmount, METRIC.MANAGEMENT_FEES);
    }

    // performance fee and supply side from gains within this period
    let performanceFeeAmount = BigInt(0);
    if (totalAssetsBefore) {
      const gains = BigInt(totalAssetsAfter) - BigInt(totalAssetsBefore);

      if (performanceFee > BigInt(0) && gains > managementFeeAmount) {
        performanceFeeAmount = (gains - managementFeeAmount) * performanceFee / BPS;
        dailyFees.add(debtAsset, performanceFeeAmount, METRIC.PERFORMANCE_FEES);
        dailyRevenue.add(debtAsset, performanceFeeAmount, METRIC.PERFORMANCE_FEES);
      }

      // supply side
      const supplySide = gains - performanceFeeAmount;
      dailyFees.add(debtAsset, supplySide, METRIC.ASSETS_YIELDS);
      dailySupplySideRevenue.add(debtAsset, supplySide, METRIC.ASSETS_YIELDS);
    }
  }

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  allowNegativeValue: true,
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch,
      start: "2026-04-09",
    },
  },
  methodology: {
    Fees: "Total yield generated from Position Manager leveraged exposure to tokenized RWAs, including management fees, performance fees, and net yield distributed to share holders.",
    Revenue: "Protocol revenue from management and performance fees collected by the facility fee recipient.",
    ProtocolRevenue: "Protocol revenue from management and performance fees collected by the facility fee recipient.",
    SupplySideRevenue: "Net yield from leveraged RWA exposure distributed to Position Manager share holders after fees.",
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.ASSETS_YIELDS]: "Net yield from leveraged RWA exposure distributed to Position Manager share holders.",
      [METRIC.MANAGEMENT_FEES]: "Time-based management fees on total assets held in Position Manager leveraged RWA positions.",
      [METRIC.PERFORMANCE_FEES]: "Performance fees on net gains from leveraged RWA exposure, charged after management fee deduction.",
    },
    Revenue: {
      [METRIC.MANAGEMENT_FEES]: "Management fees collected by the protocol fee recipient.",
      [METRIC.PERFORMANCE_FEES]: "Performance fees collected by the protocol fee recipient.",
    },
    ProtocolRevenue: {
      [METRIC.MANAGEMENT_FEES]: "Management fees directed to the protocol fee recipient.",
      [METRIC.PERFORMANCE_FEES]: "Performance fees directed to the protocol fee recipient.",
    },
    SupplySideRevenue: {
      [METRIC.ASSETS_YIELDS]: "Net yield from leveraged RWA exposure distributed to Position Manager share holders.",
    },
  },
};

export default adapter;
