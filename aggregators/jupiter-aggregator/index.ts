import { CHAIN } from "../../helpers/chains";
import { Dependencies, FetchOptions } from "../../adapters/types";
import { queryDuneSql } from "../../helpers/dune";
// 1800 1022 777
const fetch = async (_a: any, _b: any, options: FetchOptions) => {

  // https://dune.com/queries/4187430
  const data = await queryDuneSql(options, `
    SELECT 
      sum(COALESCE(input_usd,output_usd)) as volume_24
    FROM jupiter_solana.aggregator_swaps
    WHERE block_time >= from_unixtime(${options.startTimestamp}) AND block_time < from_unixtime(${options.endTimestamp})
  `);

  const chainData = data[0];
  if (!chainData) throw new Error(`Dune query failed: ${JSON.stringify(data)}`);
  return {
    dailyVolume: chainData.volume_24
  };
};

const adapter: any = {
  version: 1,
  dependencies: [Dependencies.DUNE],
  fetch,
  start: '2023-04-16',
  methodology: {
    dailyVolume:
      "Volume is calculated by summing the token volume of all trades settled on the protocol that day.",
  },
  chains: [CHAIN.SOLANA],
};

export default adapter;
