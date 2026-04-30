import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { queryDuneSql } from "../../helpers/dune";
import { CHAIN } from "../../helpers/chains";

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
	const data = await queryDuneSql(options, `
    SELECT
      COALESCE(SUM(amount_usd), 0) as usd_volume
    FROM nft.trades
    WHERE project = 'sudoswap'
      AND version = 'v2'
      AND blockchain = 'CHAIN'
      AND TIME_RANGE
  `);

	const dailyVolume = options.createBalances();
	dailyVolume.addUSDValue(data[0].usd_volume);
	return { dailyVolume };
};

const adapter: SimpleAdapter = {
	version: 1,
	adapter: {
		[CHAIN.ETHEREUM]: { fetch, start: "2023-05-22" },
		[CHAIN.ARBITRUM]: { fetch, start: "2024-01-20" },
		[CHAIN.BASE]: { fetch, start: "2023-11-01" },
	},
	dependencies: [Dependencies.DUNE],
	isExpensiveAdapter: true,
};

export default adapter;
