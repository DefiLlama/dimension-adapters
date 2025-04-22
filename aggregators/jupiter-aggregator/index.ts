import { CHAIN } from "../../helpers/chains";
import { FetchOptions } from "../../adapters/types";
import { queryDuneSql } from "../../helpers/dune";

const fetch = async (_a: any, _b: any, options: FetchOptions) => {

  // https://dune.com/queries/4187430
  const data = await queryDuneSql(options, `
    SELECT 
      sum(COALESCE(input_usd,output_usd)) as volume
      , sum(case when (block_time >= from_unixtime(${options.startTimestamp}) AND block_time < from_unixtime(${options.endTimestamp})) then COALESCE(input_usd,output_usd) else null end) as volume_24
    FROM jupiter_solana.aggregator_swaps
  `);

  const chainData = data[0];
  if (!chainData) throw new Error(`Dune query failed: ${JSON.stringify(data)}`);
  return {
    dailyVolume: chainData.volume_24,
    totalVolume: chainData.volume,
  };
};

const adapter: any = {
  version: 1,
  adapter: {
    [CHAIN.SOLANA]: {
      fetch,
      start: '2023-04-16',
      meta: {
        methodology: {
          totalVolume:
            "Volume is calculated by summing the token volume of all trades settled on the protocol since launch.",
          dailyVolume:
            "Volume is calculated by summing the token volume of all trades settled on the protocol that day.",
        },
      },
    },
  },
};

export default adapter;
