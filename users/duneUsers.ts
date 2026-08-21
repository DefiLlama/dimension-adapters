import { CHAIN } from "../helpers/chains";
import { duneDexUsersExport, duneLendingUsersExport } from "./utils/duneUsers";

const dexUsers: { id: string; projects: string[]; chains: Record<string, string> }[] = [
  {
    id: "parent#hybra",
    projects: ["hybra"],
    chains: { [CHAIN.HYPERLIQUID]: "2025-06-23" },
  },
  {
    id: "parent#ramses-exchange-hl",
    projects: ["ramses", "ramsesxyz"],
    chains: {
      [CHAIN.ARBITRUM]: "2023-03-16",
      [CHAIN.HYPERLIQUID]: "2025-06-30",
    },
  },
  {
    id: "parent#nest",
    projects: ["nest"],
    chains: { [CHAIN.HYPERLIQUID]: "2025-11-06" },
  },
];

const lendingUsers: { id: string; project: string; version: number; chains: Record<string, string> }[] = [
  {
    id: "2088", // Compound V3
    project: "compound",
    version: 3,
    chains: {
      [CHAIN.ETHEREUM]: "2022-08-26",
      [CHAIN.POLYGON]: "2023-03-07",
      [CHAIN.ARBITRUM]: "2023-05-14",
      [CHAIN.BASE]: "2023-08-12",
      [CHAIN.UNICHAIN]: "2025-03-08",
    },
  },
];

export default dexUsers.map((config) => ({
  id: config.id,
  adapter: duneDexUsersExport(config),
})).concat(lendingUsers.map(({ id, ...config }) => ({
  id,
  adapter: duneLendingUsersExport(config),
})));
