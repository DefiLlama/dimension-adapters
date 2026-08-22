import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";

const AGGREGATOR = "CAYP3UWLJM7ZPTUKL6R6BFGTRWLZ46LRKOXTERI2K6BIJAWGYY62TXTO";

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();

  const query = `
    SELECT
      regexp_extract(data_decoded, '"token_in"\\},"val":\\{"address":"([A-Z0-9]+)"\\}', 1) AS token,
      CAST(SUM(TRY_CAST(
        regexp_extract(data_decoded, '"amount_in"\\},"val":\\{"i128":"([0-9]+)"\\}', 1) AS DECIMAL(38,0)
      )) AS VARCHAR) AS amount
    FROM stellar.history_contract_events
    WHERE contract_id = '${AGGREGATOR}'
      AND closed_at_date = DATE '${options.dateString}'
      AND topics_decoded LIKE '%SoroswapAggregator%'
      AND topics_decoded LIKE '%"symbol":"swap"%'
      AND type_string = 'ContractEventTypeContract'
      AND successful = true
    GROUP BY 1
  `;

  const rows: { token: string; amount: string }[] = await queryDuneSql(options, query);

  rows.forEach(({ token, amount }) => {
    if (token && amount) dailyVolume.add(token, amount);
  });

  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 1,
  adapter: {
    [CHAIN.STELLAR]: {
      fetch,
      start: "2025-06-16",
    },
  },
  dependencies: [Dependencies.DUNE],
  isExpensiveAdapter: true,
};

export default adapter;
