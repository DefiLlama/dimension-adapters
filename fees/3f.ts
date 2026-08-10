import { ChainApi } from "@defillama/sdk";
import PromisePool from "@supercharge/promise-pool";
import pLimit from "p-limit";
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";

const POSITION_MANAGER_FACTORY = "0x8e0667429d1717b3e5fe783a6c472d6d901fe5fa";
const FACTORY_DEPLOY_BLOCK = 24844184;

const Abis = {
  PositionManagerCreated: "event PositionManagerCreated(address indexed positionManager, address indexed owner, address indexed collateralAsset, address debtAsset, uint256 ltv, address transferGuard)",
  // Emitted when fees are accrued and minted (as shares) to the fee recipient.
  FeesAccrued: "event FeesAccrued(address indexed feeRecipient, uint256 shares)",
  assets: "function assets() view returns (address collateralAsset, address debtAsset)",
  feeData: "function feeData() view returns (address feeRecipient, uint24 managementFee, uint24 performanceFee, uint256 lastTotalAssets, uint256 lastFeeAccrualTimestamp)",
  totalAssets: "uint256:totalAssets",
  totalSupply: "uint256:totalSupply",
  virtualShareOffset: "uint256:virtualShareOffset",
  // Only available since the levered-slice performance fee upgrade; revert before it.
  lastDebt: "uint256:lastDebt",
  collateralAmountQuoted: "uint256:collateralAmountQuoted",
  debtAmount: "uint256:debtAmount",
};

const BPS = BigInt(10000);
const ZERO = BigInt(0);
const ONE = BigInt(1);

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const emptyResult = { dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyFees };

  // Discover all Position Managers ever created by the factory.
  const factoryLogs = await options.getLogs({
    target: POSITION_MANAGER_FACTORY,
    eventAbi: Abis.PositionManagerCreated,
    fromBlock: FACTORY_DEPLOY_BLOCK,
    cacheInCloud: true,
  });

  const positionManagers = factoryLogs.map((log: any) => log.positionManager);
  if (positionManagers.length === 0) return emptyResult;

  const [assetsResults, feesLogs] = await Promise.all([
    options.api.multiCall({ abi: Abis.assets, calls: positionManagers, permitFailure: true }),
    options.getLogs({ targets: positionManagers, eventAbi: Abis.FeesAccrued, entireLog: true, parseLog: true }),
  ]);

  const debtAssetByManager: Record<string, string> = {};
  positionManagers.forEach((manager: string, i: number) => {
    if (assetsResults[i]) debtAssetByManager[manager.toLowerCase()] = assetsResults[i].debtAsset;
  });

  // Group FeesAccrued events by block so pre-accrual state is read once per block.
  const eventsByBlock: Record<number, Array<{ manager: string; shares: bigint; logIndex: number }>> = {};
  for (const log of feesLogs) {
    const shares = BigInt(log.args.shares);
    if (shares === ZERO) continue;
    const block = Number(log.blockNumber);
    if (!eventsByBlock[block]) eventsByBlock[block] = [];
    eventsByBlock[block].push({
      manager: log.address.toLowerCase(),
      shares,
      logIndex: log.logIndex,
    });
  }

  // For each accrual event, recompute the management/performance split from the state
  // one block before the accrual (the snapshot the contract itself accrued against).
  //
  // The contract mints `feeShares = convertToShares(feeAssets)` where
  // `feeAssets = managementFeeAssets + performanceFeeAssets` and
  // `performanceFeeAssets = max(0, basis - managementFeeAssets) * performanceFee / BPS`.
  // Inverting `convertToShares` recovers `feeAssets` (denominated in the debt asset),
  // and with the basis known the management/performance split solves algebraically.
  const { errors } = await PromisePool.withConcurrency(1)
    .for(Object.entries(eventsByBlock))
    .process(async ([blockStr, events]) => {
      const api = new ChainApi({ chain: options.chain, block: Number(blockStr) - 1 });
      const managers = Array.from(new Set(events.map((event) => event.manager)));
      const managerIndexes: Record<string, number> = {};
      managers.forEach((manager, i) => { managerIndexes[manager] = i; });

      const limit = pLimit(4);
      const [feeDatas, totalAssetsResults, totalSupplyResults, offsets, lastDebts, collaterals, debts] = await Promise.all([
        limit(() => api.multiCall({ abi: Abis.feeData, calls: managers, permitFailure: true })),
        limit(() => api.multiCall({ abi: Abis.totalAssets, calls: managers, permitFailure: true })),
        limit(() => api.multiCall({ abi: Abis.totalSupply, calls: managers, permitFailure: true })),
        limit(() => api.multiCall({ abi: Abis.virtualShareOffset, calls: managers, permitFailure: true })),
        limit(() => api.multiCall({ abi: Abis.lastDebt, calls: managers, permitFailure: true })),
        limit(() => api.multiCall({ abi: Abis.collateralAmountQuoted, calls: managers, permitFailure: true })),
        limit(() => api.multiCall({ abi: Abis.debtAmount, calls: managers, permitFailure: true })),
      ]);

      // A manager can accrue more than once in a block. The first accrual resets the
      // fee snapshot, so later accruals in the same block have a zero performance basis,
      // and their shares must be valued against the supply inflated by the earlier mints.
      const mintedSharesByManager: Record<string, bigint> = {};
      events.sort((a, b) => a.logIndex - b.logIndex);

      for (const event of events) {
        const i = managerIndexes[event.manager];
        const debtAsset = debtAssetByManager[event.manager];
        const feeData = feeDatas[i];
        if (!debtAsset || !feeData || totalAssetsResults[i] == null || totalSupplyResults[i] == null) continue;

        const alreadyMintedShares = mintedSharesByManager[event.manager] ?? ZERO;
        mintedSharesByManager[event.manager] = alreadyMintedShares + event.shares;

        const totalAssets = BigInt(totalAssetsResults[i]);
        const totalSupply = BigInt(totalSupplyResults[i]) + alreadyMintedShares;
        const offset = offsets[i] != null ? BigInt(offsets[i]) : ZERO;
        const lastTotalAssets = BigInt(feeData.lastTotalAssets);
        const performanceFee = BigInt(feeData.performanceFee);

        // Invert convertToShares: shares = feeAssets * (supply + offset) / (totalAssets - feeAssets + 1)
        // => feeAssets = shares * (totalAssets + 1) / (supply + offset + shares)
        const feeAssets = event.shares * (totalAssets + ONE) / (totalSupply + offset + event.shares);
        if (feeAssets === ZERO) continue;

        // Performance fee basis at the accrual snapshot. An earlier accrual in the same
        // block already reset the snapshot, leaving no basis for this event.
        let basis = ZERO;
        if (alreadyMintedShares === ZERO) {
          if (lastDebts[i] != null && collaterals[i] != null && debts[i] != null) {
            // Levered-slice basis: LTV_prev * currentCollat - currentDebt
            // (lastDebt == 0 is the bootstrap sentinel: no performance fee that period).
            const lastDebt = BigInt(lastDebts[i]);
            if (lastDebt > ZERO) {
              const lastCollateral = lastTotalAssets + lastDebt;
              const scaledLastDebt = (lastDebt * BigInt(collaterals[i]) + lastCollateral - ONE) / lastCollateral;
              const currentDebt = BigInt(debts[i]);
              if (scaledLastDebt > currentDebt) basis = scaledLastDebt - currentDebt;
            }
          } else if (totalAssets > lastTotalAssets) {
            // Pre-upgrade NAV-variation basis: totalAssets - lastTotalAssets.
            basis = totalAssets - lastTotalAssets;
          }
        }

        // feeAssets = mgmt + max(0, basis - mgmt) * performanceFee / BPS
        // If feeAssets < basis the performance branch was active: solve for mgmt.
        // Otherwise the whole accrual is management fees.
        let managementFeeAssets = feeAssets;
        if (performanceFee > ZERO && feeAssets < basis) {
          managementFeeAssets = (feeAssets * BPS - basis * performanceFee) / (BPS - performanceFee);
          if (managementFeeAssets < ZERO) managementFeeAssets = ZERO;
        }
        const performanceFeeAssets = feeAssets - managementFeeAssets;

        if (managementFeeAssets > ZERO) dailyFees.add(debtAsset, managementFeeAssets, METRIC.MANAGEMENT_FEES);
        if (performanceFeeAssets > ZERO) dailyFees.add(debtAsset, performanceFeeAssets, METRIC.PERFORMANCE_FEES);
      }
    });

  if (errors.length > 0) throw errors[0];
  // All accrued fees are minted to the protocol fee recipient, so fees == revenue.
  return {
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch,
      start: "2026-04-09",
    },
  },
  methodology: {
    Fees: "3F charges two fees on its leveraged RWA positions. The performance fee is taken on the return of the leveraged collateral, after subtracting the cost of the borrowed debt. The management fee is taken on the full value of the RWA collateral, including the leveraged portion, rather than only the user's deposited capital. Fees are accrued and collected when positions are updated, so a single day can include fees that built up over the preceding days or weeks.",
    Revenue: "Both the management and performance fees are paid to the protocol, so revenue equals the total fees collected.",
    ProtocolRevenue: "Both the management and performance fees are paid to the protocol, so protocol revenue equals the total fees collected.",
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.MANAGEMENT_FEES]: "Time-based management fees charged on the full value of the RWA collateral held by Position Managers, including the leveraged portion.",
      [METRIC.PERFORMANCE_FEES]: "Performance fees charged on the return of the leveraged collateral after subtracting the cost of the borrowed debt, net of management fees.",
    },
    Revenue: {
      [METRIC.MANAGEMENT_FEES]: "Management fees collected by the protocol fee recipient.",
      [METRIC.PERFORMANCE_FEES]: "Performance fees collected by the protocol fee recipient.",
    },
    ProtocolRevenue: {
      [METRIC.MANAGEMENT_FEES]: "Management fees directed to the protocol fee recipient.",
      [METRIC.PERFORMANCE_FEES]: "Performance fees directed to the protocol fee recipient.",
    },
  },
};

export default adapter;
