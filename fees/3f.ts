import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const POSITION_MANAGER_FACTORY = "0x8e0667429d1717b3e5fe783a6c472d6d901fe5fa";
const FACTORY_DEPLOY_BLOCK = 24844184;

const Abis = {
  PositionManagerCreated: "event PositionManagerCreated(address indexed positionManager, address indexed owner, address indexed collateralAsset, address debtAsset, uint256 ltv, address transferGuard)",
  // Emitted when fees are accrued and minted (as shares) to the fee recipient.
  FeesAccrued: "event FeesAccrued(address indexed feeRecipient, uint256 shares)",
  totalAssets: "uint256:totalAssets",
  totalSupply: "uint256:totalSupply",
  assets: "function assets() view returns (address collateralAsset, address debtAsset)",
};

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();

  // Discover all Position Managers ever created by the factory.
  const factoryLogs = await options.getLogs({
    target: POSITION_MANAGER_FACTORY,
    eventAbi: Abis.PositionManagerCreated,
    fromBlock: FACTORY_DEPLOY_BLOCK,
    cacheInCloud: true,
  });

  const positionManagers = factoryLogs.map((log: any) => log.positionManager);
  if (positionManagers.length === 0) return { dailyFees, dailyRevenue: dailyFees };

  // For each Position Manager:
  //  - read its debt asset (fees are denominated in shares -> converted to debt asset)
  //  - read totalAssets/totalSupply at the end of the window to price the fee shares
  //  - collect FeesAccrued events emitted during the window
  const [assetsResults, totalAssetsResults, totalSupplyResults, feesLogs] = await Promise.all([
    options.api.multiCall({ abi: Abis.assets, calls: positionManagers, permitFailure: true }),
    options.toApi.multiCall({ abi: Abis.totalAssets, calls: positionManagers, permitFailure: true }),
    options.toApi.multiCall({ abi: Abis.totalSupply, calls: positionManagers, permitFailure: true }),
    options.getLogs({ targets: positionManagers, eventAbi: Abis.FeesAccrued, flatten: false }),
  ]);

  for (let i = 0; i < positionManagers.length; i++) {
    const assets = assetsResults[i];
    const totalAssets = totalAssetsResults[i];
    const totalSupply = totalSupplyResults[i];
    const logs = feesLogs[i] || [];
    if (!assets || !totalAssets || !totalSupply || BigInt(totalSupply) === BigInt(0)) continue;

    // Sum all fee shares minted to the fee recipient during the window.
    let feeShares = BigInt(0);
    for (const log of logs) {
      feeShares += BigInt(log.shares);
    }
    if (feeShares === BigInt(0)) continue;

    // Convert fee shares to the debt asset: shares * totalAssets / totalSupply.
    const feeAssets = feeShares * BigInt(totalAssets) / BigInt(totalSupply);
    dailyFees.add(assets.debtAsset, feeAssets);
  }

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
    Fees: "3F charges two fees on its leveraged RWA positions. The performance fee is taken on the return of the leveraged collateral after subtracting the cost of the borrowed debt (for example, on a 10x position it applies to the RWA yield on the full leveraged exposure minus what is paid to service the debt). The management fee is taken on the entire value of the RWA collateral, including the leveraged portion (for example, on a 10x position it is charged on ten times the deposited amount, not just the user's own capital). Fees are accrued and collected when positions are updated, so a single day can include fees that built up over the previous days or weeks.",
    Revenue: "Both the management and performance fees are paid to the protocol, so revenue equals the total fees collected.",
    ProtocolRevenue: "Both the management and performance fees are paid to the protocol, so protocol revenue equals the total fees collected.",
  },
};

export default adapter;
