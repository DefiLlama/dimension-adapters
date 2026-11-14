import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "./chains";

const LIQUIDATION_EVENT =
  "event Liquidation(address indexed _collateralProxy, address[] _assets, uint256[] _amounts)";
const LIQUIDATION_TOPIC =
  "0x246873b6476f9c2a33e0de31e3a9a0d3d6e9268b413d04928209351193ed31fb";

// Rain settles through Coordinator contracts since 2026-11-04; the old contracts emit nothing after that.
const COORDINATOR_LIQUIDATION_EVENT =
  "event Liquidation(address indexed collateralProxy, address[] assets, uint256[] amountsNative, uint256[] amountsCents, uint8[] assetDecimals, uint256 netAmountCents, uint256[] feeNative, string indexed indexedTeamId, string teamId, string indexed indexedStatementId, string statementId)";
const COORDINATOR_LIQUIDATION_TOPIC =
  "0x8ffbf5b0226477a4783d04864504c4387123a733c097c607511ad62050434a66";

const topic = (address: string) =>
  "0x000000000000000000000000" + address.slice(2).toLowerCase();

/** Shared Rain settlement contracts used by multiple program issuers. */
export const DefaultRainContracts: Record<string, string> = {
  [CHAIN.BASE]: "0x753Fb325Ca30f229E616eA8E6Eb620D0Bb29D0Df",
  [CHAIN.ARBITRUM]: "0x753Fb325Ca30f229E616eA8E6Eb620D0Bb29D0Df",
  [CHAIN.OPTIMISM]: "0x753Fb325Ca30f229E616eA8E6Eb620D0Bb29D0Df",
  [CHAIN.ETHEREUM]: "0xE5D3d7da4b24bc9D2FDA0e206680CD8A00C0FeBD",
  [CHAIN.POLYGON]: "0x5d5Cef756412045617415FC78D510003238EAfFd",
};

/** Rain Coordinator contracts, start = 2026-11-04. */
export const RainCoordinatorContracts: Record<string, { address: string; start: number }> = {
  // https://repo.sourcify.dev/8453/0x199cE51868ECC2d7c3cA622fE9EB4991eF6bA15b
  [CHAIN.BASE]: { address: "0x199cE51868ECC2d7c3cA622fE9EB4991eF6bA15b", start: 1793750400 },
  // not on Sourcify; same address and deployer as Optimism, emits the same Liquidation since block 521219677
  [CHAIN.ARBITRUM]: { address: "0x0bbB2e4C8F159406ADD28506F33D20Fbec4E57F4", start: 1793750400 },
  // https://repo.sourcify.dev/10/0x0bbB2e4C8F159406ADD28506F33D20Fbec4E57F4
  [CHAIN.OPTIMISM]: { address: "0x0bbB2e4C8F159406ADD28506F33D20Fbec4E57F4", start: 1793750400 },
};

export interface RainCardChainConfig {
  start: string;
  collateralProxy: string;
  /** Defaults to DefaultRainContracts[chain] when omitted. */
  rain?: string;
}

const defaultMethodology = {
  Volume:
    "Total USD value of card spends settled through Rain program-issuer settlement contracts.",
};

/**
 * Track card spend volume from Rain Liquidation events filtered by collateral proxy.
 */
export function rainCardAdapterExport(
  exportConfig: Record<string, RainCardChainConfig>,
  methodology?: { Volume: string }
): SimpleAdapter {
  return {
    version: 2,
    pullHourly: true,
    fetch: async (options: FetchOptions) => {
      const dailyVolume = options.createBalances();
      const chainConfig = exportConfig[options.chain];
      const rain =
        chainConfig.rain || DefaultRainContracts[options.chain];

      if (!rain) {
        throw new Error(
          `Rain contract not configured for chain ${options.chain}`
        );
      }

      const logs = await options.getLogs({
        target: rain,
        eventAbi: LIQUIDATION_EVENT,
        topics: [LIQUIDATION_TOPIC, topic(chainConfig.collateralProxy)],
      });

      logs.forEach((log: any) => {
        log._assets.forEach((asset: string, index: number) => {
          dailyVolume.add(asset, log._amounts[index]);
        });
      });

      const coordinator = RainCoordinatorContracts[options.chain];
      if (coordinator && options.endTimestamp > coordinator.start) {
        const coordinatorLogs = await options.getLogs({
          target: coordinator.address,
          eventAbi: COORDINATOR_LIQUIDATION_EVENT,
          topics: [COORDINATOR_LIQUIDATION_TOPIC, topic(chainConfig.collateralProxy)],
        });

        // amountsNative is what leaves the proxy; Rain's feeNative is charged on top (0 on every log seen so far)
        coordinatorLogs.forEach((log: any) => {
          log.assets.forEach((asset: string, index: number) => {
            dailyVolume.add(asset, log.amountsNative[index]);
          });
        });
      }

      return { dailyVolume };
    },
    adapter: Object.fromEntries(
      Object.entries(exportConfig).map(([chain, config]) => [
        chain,
        { start: config.start },
      ])
    ),
    methodology: methodology || defaultMethodology,
  };
}

const rainCardProtocols: Record<string, SimpleAdapter> = {
  "karta-card": rainCardAdapterExport(
    {
      [CHAIN.BASE]: {
        // Paymentscan tracks Karta as Base Rain program-issuer settlements; first matched log: 2024-08-08.
        start: "2024-08-08",
        collateralProxy: "0xc81e2084A8E5AAc41ddf1Fa0B9203Aa81F332FA5",
      },
    },
    {
      Volume:
        "Total USD value of Karta card spends settled through Rain program-issuer settlement contracts.",
    }
  ),
  "tuyo-card": rainCardAdapterExport(
    {
      [CHAIN.BASE]: {
        // Paymentscan tracks Tuyo as Base Rain program-issuer settlements; first matched log: 2025-02-01.
        start: "2025-02-01",
        collateralProxy: "0xAe1790143248dCF66486fd3B8A9B99aa7691f6f5",
      },
    },
    {
      Volume:
        "Total USD value of Tuyo card spends settled through Rain program-issuer settlement contracts.",
    }
  ),
  "kolo-card": rainCardAdapterExport(
    {
      [CHAIN.POLYGON]: {
        start: "2024-10-03",
        rain: "0x5d5Cef756412045617415FC78D510003238EAfFd",
        collateralProxy: "0x9d983bfF3CB688270e7b85BCFDbEBe69f7952751",
      },
      [CHAIN.ARBITRUM]: {
        start: "2024-06-14",
        collateralProxy: "0x98965FBce47dCFD11cA61Ec007c994beE4ed2246",
      },
      [CHAIN.OPTIMISM]: {
        start: "2024-06-14",
        collateralProxy: "0x733DDAaB8341AFfEf7d625462cD0A363Cd8A3207",
      },
      [CHAIN.BASE]: {
        start: "2024-06-14",
        collateralProxy: "0x37920D57bfD3A67dB111dD692Cdd6857C8a0D32C",
      },
      [CHAIN.ETHEREUM]: {
        start: "2024-06-14",
        collateralProxy: "0x386D3D6216f89B6b22Aab7caA04e65053C7e1966",
      },
    },
    {
      Volume: "Total USD value of spends settled through Kolo Rain contracts.",
    }
  ),
};

export const protocolList = Object.keys(rainCardProtocols);
export const getAdapter = (name: string) => rainCardProtocols[name];
