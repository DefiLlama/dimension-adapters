import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";
import fetchURL from "../../utils/fetchURL";

const FeeRecipient = "0x18af30EfA58A70042013192bBDdF8A21221004b44cC1cbA1A0038cE524aAa2EE";

const fetch = async (_a:any, _b:any, options: FetchOptions) => {
  const dailyFees = options.createBalances();

  const markets = await fetchURL(`https://api.o2.app/v1/markets`);
  const orderbookContractIds = markets.markets.map(
    (market: any) => market.contract_id,
  );

  const query = `
    SELECT
      SUM(CAST(amount AS DECIMAL(38,0))) as amount,
      asset_id
    FROM fuel.receipts
    WHERE contract_id IN (${orderbookContractIds})
      AND to = ${FeeRecipient}
      AND TIME_RANGE
    GROUP BY asset_id
  `;
  const data = await queryDuneSql(options, query);
  console.log(data);
  if (data?.length > 0) {
    data.forEach((row) => {
      dailyFees.add(row.asset_id, row.amount);
    });
  }

  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  };
};

const methodology = {
  Fees: "All fees paid by users on the O2 Exchange",
  Revenue: "Fees are distributed to Fuel Labs",
  ProtocolRevenue: "Fees are distributed to Fuel Labs",
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.FUEL],
  start: "2025-12-01",
  dependencies: [Dependencies.DUNE],
  isExpensiveAdapter: true,
  methodology,
};

export default adapter;
