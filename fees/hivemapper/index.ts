import { Dependencies, FetchOptions, FetchResult, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";

const HONEY_TOKEN = "4vMsoUT2BWatFweudnQM1xedRLfJgJ7hswhcpz4xgBTy";

async function fetch(_a: any, _b: any, options: FetchOptions): Promise<FetchResult> {
  const query = `SELECT
      SUM(amount / 1e9) AS honey_burns
  FROM spl_token_solana.spl_token_call_burn
  WHERE call_block_time >= from_unixtime(${options.fromTimestamp})
    AND call_block_time < from_unixtime(${options.toTimestamp})
    AND account_mint = '${HONEY_TOKEN}'`;

  const queryResults = await queryDuneSql(options, query);
  const dailyFees = options.createBalances();
  dailyFees.addCGToken("hivemapper", queryResults[0].honey_burns);
  const dailyRevenue = dailyFees.clone(0.75);
  const dailySupplySideRevenue = dailyFees.clone(0.25);

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: 0,
    dailyHoldersRevenue: dailyRevenue,
    dailySupplySideRevenue
  }
}

const methodology = {
  Fees: "Honey token consumed burnt by map developers",
  Revenue: "75% of the fees permanently burnt, rest 25% are re-minted",
  ProtocolRevenue: "No protocol revenue",
  HoldersRevenue: "75% of the fees burnt",
  SupplySideRevenue: "25% of the fees distributed among map contributors"
}

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.SOLANA],
  dependencies: [Dependencies.DUNE],
  methodology,
  start: '2024-04-09'
}

export default adapter;