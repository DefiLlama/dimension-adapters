import { CHAIN } from "../helpers/chains";
import { duneChainStats, DuneChainStatsMode } from "../helpers/duneChainStats";
import { createFactoryExports } from "./registry";

const configs: Record<string, { start: string; table: string }> = {
  [CHAIN.ABSTRACT]: { start: "2024-10-25", table: "abstract.transactions" },
  [CHAIN.LINEA]: { start: "2023-07-06", table: "linea.transactions" },
  [CHAIN.OP_BNB]: { start: "2023-08-11", table: "opbnb.transactions" },
  [CHAIN.RONIN]: { start: "2021-01-25", table: "ronin.transactions" },
  [CHAIN.SONIC]: { start: "2024-12-01", table: "sonic.transactions" },
  [CHAIN.SOPHON]: { start: "2024-10-21", table: "sophon.transactions" },
};

const buildProtocols = (mode?: DuneChainStatsMode) => Object.fromEntries(
  Object.entries(configs).map(([chain, { start, table }]) => [
    chain,
    duneChainStats(chain, start, table, mode),
  ])
);

export const { protocolList, getAdapter } = createFactoryExports(buildProtocols());
export const newUsers = createFactoryExports(buildProtocols("new-users"));
