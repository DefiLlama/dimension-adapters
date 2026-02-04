import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryIndexer } from "../helpers/indexer";
import { httpGet } from "../utils/fetchURL";
const profitShareAPI = "https://aimbotapi.onrender.com/api/openBot/profitShare";

interface IData {
  value: string;
}

const fetch: any = async (options: FetchOptions) => {
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
    dailyFees.addGasToken(Number(e.value), 'Trading Bot Execution Fees')
  })

  // fetch profit data from OpenBot profitShare API
  const openBotFundData = await httpGet(profitShareAPI);

  const openBotFundAmount = openBotFundData['total'];
  dailyFees.addGasToken(openBotFundAmount * 1e18, 'OpenBot Profit Share');

  return { dailyFees, dailyRevenue: dailyFees }

}

const methodology = {
  Fees: "Fees paid by users while using the bot.",
  Revenue: "All fees are revenue.",
}

const breakdownMethodology = {
  Fees: {
    'Trading Bot Execution Fees': 'ETH fees collected from on-chain trading bot executions routed through Aimbot contracts.',
    'OpenBot Profit Share': 'Profit share fees collected from the Aimbot OpenBot automated trading service.',
  },
  Revenue: {
    'Trading Bot Execution Fees': 'All trading bot execution fees accrue as protocol revenue.',
    'OpenBot Profit Share': 'All OpenBot profit share fees accrue as protocol revenue.',
  },
}

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch: fetch,
      start: '2023-08-02',
    },
  },
  methodology,
  breakdownMethodology,
};

export default adapter;
