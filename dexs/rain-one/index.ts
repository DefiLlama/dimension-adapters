import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import coreAssets from "../../helpers/coreAssets.json";
import { queryDuneSql } from "../../helpers/dune";

const usdt = coreAssets.arbitrum.USDT

const fetch = async (options: FetchOptions) => {
    const dailyVolume = options.createBalances();
    const query = `
    SELECT SUM(baseAmount) AS volume FROM rain_protocol_arbitrum.rainpool_evt_enteroption WHERE evt_block_date >= DATE_TRUNC('day', from_unixtime(${options.fromTimestamp})) AND evt_block_date < DATE_TRUNC('day', from_unixtime(${options.toTimestamp}))`
    const queryResult = await queryDuneSql(options, query)
    dailyVolume.add(usdt, queryResult[0].volume)

    return {
        dailyVolume,
    };
};

const methodology = {
  Volume: "All trades on prediction markets",
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.ARBITRUM],
  start: "2025-02-17",
  methodology,
  dependencies: [Dependencies.DUNE]
};

export default adapter;