import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";
import axios from "axios";

const ApiBaseUrl = "https://api.o2.app";
const FeeRecipient =
  "0xdcc963dfc7dd7773af66e9777b9c67262649066ab136eec98ef32d868c1517e9";

const fetch = async (options: FetchOptions) => {
  const markets = await axios.get(ApiBaseUrl.concat("/v1/markets"));
  const orderbookContractIds = markets.data.markets.map(
    (market) => market.contract_id,
  );

  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();

  const combinedQuery = `
    SELECT
      SUM(CAST(amount AS DECIMAL(38,0))) as amount,
      asset_id,
      'volume' as metric_type
    FROM fuel.receipts
    WHERE to IN (${orderbookContractIds})
      AND block_time >= FROM_UNIXTIME(${options.startTimestamp})
      AND block_time < FROM_UNIXTIME(${options.endTimestamp})
    GROUP BY asset_id

    UNION ALL

    SELECT
      SUM(CAST(amount AS DECIMAL(38,0))) as amount,
      asset_id,
      'fee' as metric_type
    FROM fuel.receipts
    WHERE contract_id IN (${orderbookContractIds})
      AND to = ${FeeRecipient}
      AND block_time >= FROM_UNIXTIME(${options.startTimestamp})
      AND block_time < FROM_UNIXTIME(${options.endTimestamp})
    GROUP BY asset_id
  `;

  const results = await queryDuneSql(options, combinedQuery);

  if (results && results.length > 0) {
    results.forEach((row) => {
      if (row.metric_type === "volume") {
        dailyVolume.add(row.asset_id, row.amount);
      } else if (row.metric_type === "fee") {
        dailyFees.add(row.asset_id, row.amount);
      }
    });
  }

  // we don't track revenue as a percentage of the fees yet
  const dailyRevenue = dailyFees;
  const dailyProtocolRevenue = dailyFees;

  return { dailyVolume, dailyFees, dailyProtocolRevenue, dailyRevenue };
};

const methodology = {
  Fees: "All fees paid by users on the O2 Exchange",
  Revenue: "Fees are distributed to Fuel Labs",
  ProtocolRevenue: "Fees are distributed to Fuel Labs",
  Volume:
    "The volume is calculated based on the amount of assets entering the orderbooks",
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.FUEL],
  start: "2025-12-1",
  methodology,
};

export default adapter;
