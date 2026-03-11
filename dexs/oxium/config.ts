import { CHAIN } from "../../helpers/chains";

export type ConfigEntry = {
  indexerURL: string;
  chainId: number;
  start: string;
};

export const oxiumConfig: Record<string, ConfigEntry> = {
  [CHAIN.SEI]: {
    indexerURL: "https://indexer-sei.mgvinfra.com",
    chainId: 1329,
    start: "2025-04-25",
  },
};
