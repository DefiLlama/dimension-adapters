import { SimpleAdapter, Dependencies, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryDuneSql } from "../helpers/dune";

interface IData {
  daily_fees: number;
  daily_revenue: number;
}

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();

  const data: IData[] = await queryDuneSql(options, `
    WITH allocate_raw AS (
      SELECT
        e.transaction_hash,
        e.data,
        TRY(VARBINARY_TO_UINT256(e.data[1])) AS n_recipients,
        TRY(VARBINARY_TO_UINT256(e.data[TRY_CAST((TRY(VARBINARY_TO_UINT256(e.data[1])) * 2) + 3 AS BIGINT)])) / 1e18 AS amount
      FROM starknet.events e
      WHERE e.from_address = 0x066e3e2ea2095b2a0424b9a2272e4058f30332df5ff226518d19c20d3ab8e842
        AND e.keys[1] = 0x01453a8b2eb4888bfee5a5b17781ba95747a5f795cd81b44fe943773178f8d8e
        AND e.block_time >= from_unixtime(${options.startTimestamp})
        AND e.block_time < from_unixtime(${options.endTimestamp})
    ),
    allocate_expanded AS (
      SELECT
        r.transaction_hash,
        r.data[2 + idx] AS recipient,
        r.amount AS total_amount,
        (TRY(VARBINARY_TO_UINT256(r.data[3 + TRY_CAST(r.n_recipients AS BIGINT) + idx])) / 1e27) * r.amount AS recipient_amount
      FROM allocate_raw r
      CROSS JOIN UNNEST(SEQUENCE(0, TRY_CAST(r.n_recipients AS BIGINT) - 1)) AS t(idx)
    )
    SELECT
      COALESCE(SUM(DISTINCT total_amount), 0) AS daily_fees,
      COALESCE(SUM(CASE WHEN recipient IN (
        CAST(0x00ca40fca4208a0c2a38fc81a66c171623aac3b913a4365f7f0bc0eb3296573c AS VARBINARY),
        CAST(0x05f8f482c5855cb2ca4f183c1b1b6417e1b0e153cb84a21cc8489e0f58f0a30c AS VARBINARY)
      ) THEN recipient_amount ELSE 0 END), 0) AS daily_revenue
    FROM allocate_expanded
  `);

  if (data.length > 0) {
    dailyFees.addUSDValue(data[0].daily_fees);
    dailyRevenue.addUSDValue(data[0].daily_revenue);
  }

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
  };
}

const methodology = {
  Fees: "All interest and minting fees",
  Revenue: "protocol share from fees",
  ProtocolRevenue: "protocol share from fees",
}

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.STARKNET],
  start: '2024-07-01',
  methodology,
  dependencies: [Dependencies.DUNE],
}

export default adapter;
