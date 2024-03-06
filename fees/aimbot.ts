import { FetchOptions, FetchResultFees, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryIndexer } from "../helpers/indexer";
import { httpGet } from "../utils/fetchURL";
const profitShareAPI = "https://aimbotapi.onrender.com/api/openBot/profitShare";

interface IData {
  value: string;
}

const fetch: any = async (timestamp: number, _: any, options: FetchOptions): Promise<FetchResultFees> => {
    const { createBalances, } = options
  const dailyFees = createBalances()
  const transfer_txs = `
      SELECT
          value
      FROM
          ethereum.traces
      WHERE
          block_number > 17829271
          AND to_address IN (
              SELECT DISTINCT address
              FROM ethereum.traces
              WHERE
                  block_number > 17829271
                  AND from_address IN ('\\x077905FA422A6C1f45Ad81D305e15dD94f8af56E')
                  AND "type" = 'create'
          )
          and from_address = '\\x0c48250Eb1f29491F1eFBeEc0261eb556f0973C7'
          AND block_time BETWEEN llama_replace_date_range;
    `;

  const transactions: IData[] = (await queryIndexer(transfer_txs, options)) as any
  transactions.map((e: IData) => {
    dailyFees.addGasToken(Number(e.value))
  })

  // fetch profit data from OpenBot profitShare API
  const openBotFundData = await httpGet(profitShareAPI);

  const openBotFundAmount = openBotFundData['total'];
  dailyFees.addGasToken(openBotFundAmount * 1e18);

  return { dailyFees, dailyRevenue: dailyFees, timestamp }

}

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch: fetch,
      start: 1690934400,
    },
  },
};

export default adapter;
