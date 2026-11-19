import { Dependencies, FetchV2, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryAllium } from "../../helpers/allium";

const SWAP_ACCOUNT = '0x31a6675cbe84365bf2b0cbce617ece6c47023ef70826533bde5203d32171dc3c';
const SWAP_EVENT = `${SWAP_ACCOUNT}::swap::SwapEvent`;

const pairTokens = (eventType: string): [string, string] => {
  const open = eventType.indexOf('<');
  const close = eventType.lastIndexOf('>');
  if (open < 0 || close < 0 || close <= open) throw new Error(`Unparseable SushiSwap Aptos swap type: ${eventType}`);
  const inner = eventType.slice(open + 1, close);
  let depth = 0;
  for (let i = 0; i < inner.length; i++) {
    const char = inner[i];
    if (char === '<') depth++;
    else if (char === '>') depth--;
    else if (char === ',' && depth === 0) return [inner.slice(0, i).trim(), inner.slice(i + 1).trim()];
  }
  throw new Error(`Unparseable SushiSwap Aptos swap type: ${eventType}`);
};

const fetchVolume: FetchV2 = async (options) => {
  const dailyVolume = options.createBalances();
  const rows: { type: string; amount_x_out: string; amount_y_out: string }[] = await queryAllium(`
    SELECT
      type,
      CAST(SUM(TRY_CAST(data:amount_x_out::STRING AS DECIMAL(38, 0))) AS VARCHAR) AS amount_x_out,
      CAST(SUM(TRY_CAST(data:amount_y_out::STRING AS DECIMAL(38, 0))) AS VARCHAR) AS amount_y_out
    FROM aptos.raw.events
    WHERE block_timestamp >= TO_TIMESTAMP_NTZ(${options.fromTimestamp})
      AND block_timestamp < TO_TIMESTAMP_NTZ(${options.toTimestamp})
      AND account_address = '${SWAP_ACCOUNT}'
      AND type LIKE '${SWAP_EVENT}<%'
      AND transaction_success = TRUE
    GROUP BY 1
  `);

  for (const row of rows ?? []) {
    const [tokenX, tokenY] = pairTokens(row.type);
    if (row.amount_x_out && row.amount_x_out !== '0') dailyVolume.add(tokenX, row.amount_x_out);
    if (row.amount_y_out && row.amount_y_out !== '0') dailyVolume.add(tokenY, row.amount_y_out);
  }

  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  dependencies: [Dependencies.ALLIUM],
  isExpensiveAdapter: true,
  adapter: {
    [CHAIN.APTOS]: {
      fetch: fetchVolume,
      start: '2024-02-27',
    },
  },
  methodology: {
    Volume: "Sum of tokens paid out of SushiSwap Aptos pools, from each swap's SwapEvent. Each swap is counted once, on the token that left the pool.",
  },
};

export default adapter;
