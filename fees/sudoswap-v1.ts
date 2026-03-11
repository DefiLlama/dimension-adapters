import { Adapter, FetchOptions, FetchResultFees } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryIndexer } from "../helpers/indexer";

const PROTOCOL_FEE_LABEL = "Protocol fees";

const fetch = async (timestamp: number, _: any, options: FetchOptions): Promise<FetchResultFees> => {
  const dailyFees = options.createBalances();
  const eth_transfer_logs: any = await queryIndexer(`
      SELECT
        sum("value") AS eth_value
      FROM
        ethereum.traces
      WHERE
        block_number > 14645816
        AND to_address = '\\xb16c1342E617A5B6E4b631EB114483FDB289c0A4'
        AND block_time BETWEEN llama_replace_date_range;
        `, options);
  dailyFees.addGasToken(eth_transfer_logs[0].eth_value, PROTOCOL_FEE_LABEL);
  return { dailyFees, timestamp, dailyRevenue: dailyFees, }
}

const methodology = {
  Fees: "Protocol fees collected on NFT trades through sudoswap AMM pools",
  Revenue: "All protocol fees are retained by sudoswap"
}

const breakdownMethodology = {
  Fees: {
    [PROTOCOL_FEE_LABEL]: "Protocol fees charged on NFT trades executed through sudoswap's automated market maker pools"
  },
  Revenue: {
    [PROTOCOL_FEE_LABEL]: "All protocol fees from NFT trades are retained by the sudoswap protocol"
  }
}

const adapter: Adapter = {
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch: fetch as any,
      start: '2023-01-01'
    },
  },
  methodology,
  breakdownMethodology
};

export default adapter;
