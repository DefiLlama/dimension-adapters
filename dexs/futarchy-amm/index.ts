import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getSqlFromFile, queryDuneSql } from "../../helpers/dune";

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const dailyVolume = options.createBalances();

  const sql = getSqlFromFile('helpers/queries/futarchy-volume.sql', {
    start: options.startTimestamp,
    end: options.endTimestamp,
  });

  const result = await queryDuneSql(options, sql);
  const volume = result[0]?.volume ?? 0;
  dailyVolume.addUSDValue(volume);

  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.SOLANA]: {
      fetch,
      start: '2025-10-09',
    },
  },
  dependencies: [Dependencies.DUNE],
  isExpensiveAdapter: true,
  methodology: {
    Volume: "Volume represents total USDC-equivalent value swapped via Futarchy AMM SpotSwap events. For buys, volume = input_amount; for sells, volume = output_amount.",
  },
};

export default adapter;
