import { FetchOptions, SimpleAdapter } from "../adapters/types"
import { CHAIN } from "../helpers/chains"
import { queryDuneSql } from "../helpers/dune"
import { getSolanaReceived } from "../helpers/token"


interface IData  {
  fee_usd: string;
}

const fethcFeesSolana = async (options: FetchOptions) => {
  // limit order fees
  const dailyFees = await getSolanaReceived({ options, targets: [
    'jupoNjAxXgZ4rjzxzPMP4oxduvQsQtZzyknqvzYNrNu'
    ,'27ZASRjinQgXKsrijKqb9xyRnH6W5KWgLSDveRghvHqc'
  ]})
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
  return { dailyFees, dailyRevenue }
}


const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.SOLANA]: {
      fetch: fethcFeesSolana,
      start: '2023-06-01',
    },
  },
  isExpensiveAdapter: true,
}

export default adapter
