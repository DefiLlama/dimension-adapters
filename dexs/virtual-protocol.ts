import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getSqlFromFile, queryDuneSql } from "../helpers/dune";

const prefetch = async (options: FetchOptions) => {
  const sql_query = getSqlFromFile('helpers/queries/virtual-protocol-volume.sql', { startTimestamp: options.startTimestamp, endTimestamp: options.endTimestamp })
  return await queryDuneSql(options, sql_query);
}

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();

  const results = options.preFetchedResults || [];
  const chainData = results.find((item: any) => item.chain === options.chain);
  if (!chainData) {
    // Throw rather than report 0, so a failed/empty query marks the day missing
    // instead of writing a false zero into the historical series.
    throw new Error(`No volume data returned for chain ${options.chain}`);
  }

  // Bonding-curve volume, denominated in VIRTUAL, priced to USD by the adapter.
  dailyVolume.addCGToken('virtual-protocol', chainData.virtual_volume);

  return { dailyVolume };
}

const methodology = {
  Volume: "Bonding-curve trading volume on Virtual Protocol's own venue, reconstructed on-chain (no private tables). Bonding pairs are collected from the bonding-factory events (PreLaunched/Launched for the current factory generation, PairCreated for the legacy Base FFactories); volume is the VIRTUAL leg of each FPair Swap, priced to USD. Post-graduation trades are excluded as they occur on third-party DEXs already counted elsewhere. Covers Base (legacy + current factories) and Robinhood.",
}

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  adapter: {
    [CHAIN.BASE]: { start: "2024-10-15", },
    [CHAIN.ROBINHOOD]: { start: "2026-07-02", },
  },
  prefetch,
  dependencies: [Dependencies.DUNE],
  methodology,
  isExpensiveAdapter: true,
}

export default adapter;
