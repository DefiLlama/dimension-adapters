import { FetchOptions, SimpleAdapter } from "../adapters/types"
import { CHAIN } from "../helpers/chains"
import { queryDuneSql } from "../helpers/dune"
import { queryAllium } from "../helpers/allium"
import { getSolanaReceived } from "../helpers/token"
import ADDRESSES from "../helpers/coreAssets.json"

interface IData {
  fee_usd: string;
}

const JUP_LITTERBOX_ADDRESS = '6tZT9AUcQn4iHMH79YZEXSy55kDLQ4VbA3PMtfLVNsFX'

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  // limit order fees
  const dailyFees = await getSolanaReceived({
    options, targets: [
      'jupoNjAxXgZ4rjzxzPMP4oxduvQsQtZzyknqvzYNrNu'
      , '27ZASRjinQgXKsrijKqb9xyRnH6W5KWgLSDveRghvHqc'
    ]
  })
  // ultra fees
  // https://dune.com/queries/4769928
  const data: IData[] = await queryDuneSql(options, `
    WITH fee_instruction_calls AS (
      SELECT 
          tx_id
        , tx_signer
        , tx_success
        , block_time
        , block_slot
        , data
        , ROW_NUMBER() OVER (PARTITION BY tx_id ORDER BY outer_instruction_index ASC, COALESCE(inner_instruction_index,0) ASC) AS log_index
      FROM solana.instruction_calls
      WHERE executing_account = 'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4'
        AND bytearray_substring(data,1,8) = 0xe445a52e51cb9a1d
        AND bytearray_substring(data,1+8,8) = 0x494f4e7fb8d50ddc -- FeeEvent https://solscan.io/account/JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4#anchorProgramIDL
        AND tx_success = true
        AND block_slot >= 316169420
    ), fees_v6 AS (
      SELECT
          tk.symbol
        , tk.decimals
        , toBase58(bytearray_substring(fic.data,1+16,32)) AS account
        , toBase58(bytearray_substring(fic.data,1+48,32)) AS mint
        , bytearray_to_bigint(bytearray_reverse(bytearray_substring(fic.data,1+80,8))) AS fee_amount
        , fic.block_slot
        , fic.block_time
        , fic.tx_id
        , fic.tx_signer
        , fic.log_index
        , 6 AS jup_version
      FROM fee_instruction_calls fic
        LEFT JOIN tokens_solana.fungible tk ON tk.token_mint_address = toBase58(bytearray_substring(fic.data,1+48,32))
      WHERE tk.symbol NOT IN ('ELISA','BEEF','ASDEX')
    )
        
    SELECT 
        DATE_TRUNC('day', t1.block_time) AS day
      , SUM(t1.fee_amount/pow(10,t1.decimals) * COALESCE(t2.price,0)) AS fee_usd
    FROM fees_v6 t1
    LEFT JOIN prices.usd t2
      ON t2.blockchain = 'solana' 
      AND toBase58(t2.contract_address) = t1.mint
      AND t2.minute = date_trunc('minute',t1.block_time)
    WHERE t1.fee_amount/pow(10,t1.decimals) * COALESCE(t2.price,0) < 1e7 --less than 1 million usd fee on a single trade
        and t1.block_time >= FROM_UNIXTIME(${options.startTimestamp})
        and t1.block_time < FROM_UNIXTIME(${options.endTimestamp})
        GROUP BY 1
  `);

  const dailyFeesUltra = options.createBalances()
  data.forEach((item) => {
    dailyFeesUltra.addUSDValue(item.fee_usd)
  })
  const dailyRevenue = dailyFees.clone()
  dailyFees.addBalances(dailyFeesUltra)
  dailyFeesUltra.resizeBy(0.25) // 
  dailyRevenue.addBalances(dailyFeesUltra)

  const query = `
    SELECT SUM(raw_amount) as total_amount
    FROM solana.assets.transfers
    WHERE to_address = '${JUP_LITTERBOX_ADDRESS}'
    AND mint = '${ADDRESSES.solana.JUP}'
    AND block_timestamp BETWEEN TO_TIMESTAMP_NTZ(${options.startTimestamp}) AND TO_TIMESTAMP_NTZ(${options.endTimestamp})
  `
  const res = await queryAllium(query);
  const dailyHoldersRevenue = options.createBalances();
  dailyHoldersRevenue.add(ADDRESSES.solana.JUP, res[0].total_amount || 0);

  return {
    dailyFees,
    dailyRevenue,
    dailyHoldersRevenue
  }
}


const adapter: SimpleAdapter = {
  version: 1,
  adapter: {
    [CHAIN.SOLANA]: {
      fetch: fetch,
      start: '2023-06-01',
    },
  },
  isExpensiveAdapter: true,
  methodology: {
    Fees: 'Trading fees paid by users.',
    Revenue: 'Portion of fees collected by protocol.', // we don't add the holders revenue as it's 50% of ecosystem protocol revenue.
    HolderRevenue: 'Jup Buybacks from 50% of jupiter ecosystem protocol revenue.',
  },
}

export default adapter
