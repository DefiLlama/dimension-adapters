import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "./chains";

const LIQUIDATION_EVENT =
  "event Liquidation(address indexed _collateralProxy, address[] _assets, uint256[] _amounts)";
const LIQUIDATION_TOPIC =
  "0x246873b6476f9c2a33e0de31e3a9a0d3d6e9268b413d04928209351193ed31fb";

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
