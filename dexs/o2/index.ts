import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";
import axios from "axios";

const ApiBaseUrl = "https://api.o2.app";
const IndexerBaseUrl = "http://157.245.207.118:3003/v1/defillama";
const FeeRecipient =
  "0x18af30EfA58A70042013192bBDdF8A21221004b44cC1cbA1A0038cE524aAa2EE";

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
      asset_id
    FROM fuel.receipts
    WHERE contract_id IN (${orderbookContractIds})
      AND to = ${FeeRecipient}
      AND block_time >= FROM_UNIXTIME(${options.startTimestamp})
      AND block_time < FROM_UNIXTIME(${options.endTimestamp})
    GROUP BY asset_id
  `;

  const [duneResults, volumeResults] = await Promise.all([
    queryDuneSql(options, combinedQuery),
    axios
      .get(
        `${IndexerBaseUrl}/volumes?from=${options.startTimestamp}&to=${options.endTimestamp}`,
      )
      .then((res) => res.data)
      .catch(() => []),
  ]);

  if (duneResults?.length > 0) {
    duneResults.forEach((row) => {
      dailyFees.add(row.asset_id, row.amount);
    });
  }

  volumeResults.forEach((result) => {
    dailyVolume.add(result.base_asset_id, result.base_volume);
  });

  return {
    dailyVolume,
    dailyFees,
    dailyProtocolRevenue: dailyFees,
    dailyRevenue: dailyFees,
  };
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
