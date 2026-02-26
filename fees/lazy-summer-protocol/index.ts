import { Adapter, FetchOptions, FetchResultV2 } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const configs: Record<string, any> = {
  [CHAIN.ETHEREUM]: {
    harborCommands: ["0x09eb323dBFECB43fd746c607A9321dACdfB0140F"],
    start: '2025-02-10',
  },
  [CHAIN.BASE]: {
    harborCommands: ["0x09eb323dBFECB43fd746c607A9321dACdfB0140F"],
    start: '2025-02-10',
  },
  [CHAIN.ARBITRUM]: {
    harborCommands: [
      "0x09eb323dBFECB43fd746c607A9321dACdfB0140F",
      "0x7fBfb946cA4ba96559467E84ef41DA6cfE0C9a17",
    ],
    start: '2025-02-10',
  },
  [CHAIN.SONIC]: {
    harborCommands: ["0xa8E4716a1e8Db9dD79f1812AF30e073d3f4Cf191"],
    start: '2025-02-10',
  },
  [CHAIN.HYPERLIQUID]: {
    harborCommands: ["0x5CD5D7e3A1b604E0EdeDc4A2343b312729e09E3F"],
    start: '2025-12-03',
  },
};

const abi = {
  getActiveFleetCommanders: "function getActiveFleetCommanders() view returns (address[])",
  asset: "function asset() view returns (address)",
  convertToAssets: "function convertToAssets(uint256 shares) view returns (uint256)",
};

async function fetch(options: FetchOptions): Promise<FetchResultV2> {
  const dailyFees = options.createBalances();
  
  const activePerCommands = await options.api.multiCall({
    abi: abi.getActiveFleetCommanders,
    calls: configs[options.chain].harborCommands,
    permitFailure: true,
  });
  for (const fleetCommanders of activePerCommands) {
    if (fleetCommanders && fleetCommanders.length > 0) {
      const assets = await options.api.multiCall({
        abi: abi.asset,
        calls: fleetCommanders,
        permitFailure: true,
      });
      const priceShares = await options.api.multiCall({
        abi: abi.convertToAssets,
        calls: fleetCommanders.map((fleet: string) => ({ target: fleet, params: [String(BigInt(1e18))] })),
        permitFailure: true,
      });
      const tipAccruedLogs = await options.getLogs({
        targets: fleetCommanders,
        eventAbi: "event TipAccrued(uint256 tipAmount)",
        flatten: false,
      });
      for (let i = 0; i < assets.length; i++) {
        if (assets[i]) {
          for (const log of tipAccruedLogs[i]) {
            const assetAmount = BigInt(log.tipAmount) * BigInt(priceShares[i]) / BigInt(1e18)
            dailyFees.add(assets[i], assetAmount);
          }
        }
      }
    }
  }
  
  const dailySupplySideRevenue = dailyFees.clone(0.7);
  const dailyRevenue = dailyFees.clone(0.3);
  const dailyProtocolRevenue = dailyFees.clone(0.1);
  const dailyHoldersRevenue = dailyFees.clone(0.2);
  
  return {
    dailyFees,
    dailyRevenue,
    dailySupplySideRevenue,
    dailyProtocolRevenue,
    dailyHoldersRevenue,
  }
}

const adapter: Adapter = {
  version: 2,
  pullHourly: true,
  fetch,
  adapter: configs,
  methodology: {
    Fees: "TipAccrued share amounts emitted by active FleetCommanders, converted to vault assets via convertToAssets and summed per underlying asset token.",
    Revenue: "30% of tips flow to the DAO treasury and SUMR stakers.",
    ProtocolRevenue: "10% of tips go to DAO treasury.",
    HoldersRevenue: "20% of tips go to SUMR stakers.",
    SupplySideRevenue: "70% of tips are distributed to FleetCommanders depositors.",
  },
};

export default adapter;
