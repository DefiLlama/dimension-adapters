import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";
import { FetchOptions } from "../../adapters/types";

/*
use axiedao.org proxy, because public endpoint
https://thegraph-v2.roninchain.com/subgraphs/name/axieinfinity/katana-v3
blocks requests from the DefiLlama server
*/

interface IData {
    volume: number;
}

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
    const data: IData[] = await queryDuneSql(options, `
      select 
        sum(amount_usd) as volume
      from dex.trades
      where project = 'katana' and version = '3'
        and block_time >= from_unixtime(${options.startTimestamp})
        and block_time < from_unixtime(${options.endTimestamp})
    `);

    const dailyVolume = data[0].volume || 0;

    return {
        dailyVolume
    };
};

const adapter: SimpleAdapter = {
  version: 1,
  adapter: {
      [CHAIN.RONIN]: {
          fetch,
          start: '2024-11-26'
      }
  },
  isExpensiveAdapter: true
};

export default adapter;
