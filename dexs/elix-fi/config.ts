import { CHAIN } from "../../helpers/chains";

export type ConfigEntry = {
  indexerURL: string;
  chainId: number;
  start: string;
};

export const elixfiConfig: Record<string, ConfigEntry> = {
  [CHAIN.SOMNIA]: {
    indexerURL: "https://elixfi-indexer.up.railway.app",
    chainId: 5031,
    start: "2025-10-20",
  },
};