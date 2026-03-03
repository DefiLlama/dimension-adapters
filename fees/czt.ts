import { Adapter, Dependencies, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryDuneSql } from "../helpers/dune";

// v2 mainnet deployment (February 15, 2026)
const VAULT_ADDRESS = "0x982577d229191b0227cf90574c2be5bf842a73f4728f7386f7402420123fb4a6";

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
    const query = `    
    SELECT
      COALESCE(SUM(CAST(JSON_EXTRACT_SCALAR(data, '$.amount') AS DOUBLE)) / 1e6, 0) AS revenue
    FROM aptos.events
    WHERE event_type = '${VAULT_ADDRESS}::payment_vault::DepositEvent'
      AND block_time >= from_unixtime(${options.startTimestamp})
      AND block_time < from_unixtime(${options.endTimestamp})
  `;
    const results = await queryDuneSql(options, query);
    const dailyRevenue = results[0].revenue;

    return {
        dailyFees: dailyRevenue,
        dailyRevenue: dailyRevenue,
        dailyProtocolRevenue: dailyRevenue,
    };
};

const methodology = {
    Fees: "All USDT/USDt deposits from users subscribing to character content",
    Revenue: "100% of deposits flow to protocol for distribution to character creators",
    ProtocolRevenue: "100% of deposits (distributed to creators off-chain)",
};

const adapter: Adapter = {
    version: 1,
    dependencies: [Dependencies.DUNE],
    fetch,
    chains: [CHAIN.APTOS],
    start: "2026-02-15",
    methodology,
    isExpensiveAdapter: true,
};

export default adapter;
