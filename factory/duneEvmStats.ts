import { CHAIN } from "../helpers/chains";
import { duneChainStats, DuneChainStatsMode } from "../helpers/duneChainStats";
import { createFactoryExports } from "./registry";

type ProtocolConfig = {
  chain: string;
  start: string;
  table: string;
};

const protocolConfigMap: Record<string, ProtocolConfig> = {
  "abstract": { chain: CHAIN.ABSTRACT, start: "2024-10-25", table: "abstract.transactions" },
  "linea": { chain: CHAIN.LINEA, start: "2023-07-06", table: "linea.transactions" },
  "op_bnb": { chain: CHAIN.OP_BNB, start: "2023-08-11", table: "opbnb.transactions" },
  "ronin": { chain: CHAIN.RONIN, start: "2021-01-25", table: "ronin.transactions" },
  "sonic": { chain: CHAIN.SONIC, start: "2024-12-01", table: "sonic.transactions" },
  "sophon": { chain: CHAIN.SOPHON, start: "2024-10-21", table: "sophon.transactions" },
};

const buildProtocols = (mode?: DuneChainStatsMode) => Object.fromEntries(
  Object.entries(protocolConfigMap).map(([name, { chain, start, table }]) => [
    name,
    duneChainStats(chain, start, table, mode),
  ])
);

export const { protocolList, getAdapter } = createFactoryExports(buildProtocols());
export const newUsers = createFactoryExports(buildProtocols("new-users"));
