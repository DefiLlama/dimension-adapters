import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryDuneSql } from "../helpers/dune";
// import { addGasTokensReceived, addTokensReceived, getETHReceived } from "../helpers/token";

// const feeReceiverMultisig = [
//   "0x48735904455eda3aa9a0c9e43ee9999c795e30b9",
//   "0x55d571b7475F4382C2a15D24A7C864cA679407c4",
//   "0x60Be34554F193f4f6862b0E12DC16BA30163D6d0",
//   "0x31120f443365efa63330d2D962f537aE28f0d672",
//   "0xf89b36B36A634745eEFbbF17d5F777A494F8B6F7",
//   "0xC1865A53609eaEC415b530632F43F4297392b224"
// ] // source: https://dune.com/queries/4068894/6851717

// const fromAddresses = [
//   "0xEC4549caDcE5DA21Df6E6422d448034B5233bFbC",
//   "0x5c952063c7fc8610FFDB798152D69F0B9550762b"
// ]
// const revshareWallet = "0x2b6e6e4def77583229299cf386438a227e683b28" // not entirely sure but i suspect this is a rev share wallet

const fetch: any = async (_a:any, _b:any, options: FetchOptions) => {
  const query = `
    WITH bnb_received AS (
      SELECT
        COALESCE(SUM(CASE WHEN l.contract_address != 0x2b6e6e4def77583229299cf386438a227e683b28 
          THEN p.price * (CAST(bytearray_to_uint256(bytearray_substring(l.data, 1, 32)) AS DOUBLE) / 1e18) 
          ELSE 0 END), 0) AS revenue_usd,
        COALESCE(SUM(p.price * (CAST(bytearray_to_uint256(bytearray_substring(l.data, 1, 32)) AS DOUBLE) / 1e18)), 0) AS fees_usd
      FROM bnb.logs l
      LEFT JOIN prices.usd p ON 
        p.blockchain = 'bnb'
        AND p.contract_address = 0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c
        AND p.minute = date_trunc('minute', l.block_time)
      WHERE l.topic0 = 0x3d0ce9bfc3ed7d6862dbb28b2dea94561fe714a1b4d019aa8af39730d1ad7c3d
      AND l.contract_address IN (
        0x48735904455eDa3aa9a0c9e43EE9999c795E30b9,
        0x55d571b7475F4382C2a15D24A7C864cA679407c4,
        0x60Be34554F193f4f6862b0E12DC16BA30163D6d0,
        0x31120f443365efa63330d2D962f537aE28f0d672,
        0xf89b36B36A634745eEFbbF17d5F777A494F8B6F7,
        0xC1865A53609eaEC415b530632F43F4297392b224,
        0xAaC9B5c6bC7D8bE29A4021138f8A0b29e557Ff90,
        0xbB389e252bDf9d55332D217d9FE06bED43b23c2f,
        0xC1D73ed52f810dB8A2C1a5785C5b743F1996DbB4,
        0x15Eb4Cbc2C53bf6CDBE49711E8b2E97D2712439a,
        0xB5afC2F8836682AFD5A711Ad555e7FD55ec38a20,
        0x060aeca503f7383Fe8FBA8c9659ee0b8bf637077,
        0x0232fCa3F2E8bb567e851151c396cEB3D0D47c11,
        0x821cfB3921Bae561fbF9527fdc5A4285468740AA,
        0xb10c5381fC00Bc8296016EC21B7E29a852414c48
      )
      AND l.topic1 IN (
        0x000000000000000000000000EC4549caDcE5DA21Df6E6422d448034B5233bFbC,
        0x0000000000000000000000005c952063c7fc8610FFDB798152D69F0B9550762b
      )
      AND l.block_time >= from_unixtime(${options.startTimestamp})
      AND l.block_time < from_unixtime(${options.endTimestamp})
    ),
    
    token_received AS (
      SELECT
        COALESCE(SUM(CASE WHEN l.topic2 != 0x0000000000000000000000002b6e6e4def77583229299cf386438a227e683b28 
          THEN p.price * (CAST(bytearray_to_uint256(bytearray_substring(l.data, 1, 32)) AS DOUBLE) / POW(10, COALESCE(e.decimals, 18)))
          ELSE 0 END), 0) AS revenue_usd,
        COALESCE(SUM(p.price * (CAST(bytearray_to_uint256(bytearray_substring(l.data, 1, 32)) AS DOUBLE) / POW(10, COALESCE(e.decimals, 18)))), 0) AS fees_usd
      FROM bnb.logs l
      LEFT JOIN tokens.erc20 e ON 
        e.blockchain = 'bnb'
        AND e.contract_address = l.contract_address
      LEFT JOIN prices.usd p ON 
        p.blockchain = 'bnb'
        AND p.contract_address = l.contract_address
        AND p.minute = date_trunc('minute', l.block_time)
      WHERE l.topic0 = 0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef
      AND l.topic1 IN (
        0x000000000000000000000000EC4549caDcE5DA21Df6E6422d448034B5233bFbC,
        0x0000000000000000000000005c952063c7fc8610FFDB798152D69F0B9550762b
      )
      AND l.topic2 IN (
        0x00000000000000000000000048735904455eDa3aa9a0c9e43EE9999c795E30b9,
        0x00000000000000000000000055d571b7475F4382C2a15D24A7C864cA679407c4,
        0x00000000000000000000000060Be34554F193f4f6862b0E12DC16BA30163D6d0,
        0x00000000000000000000000031120f443365efa63330d2D962f537aE28f0d672,
        0x000000000000000000000000f89b36B36A634745eEFbbF17d5F777A494F8B6F7,
        0x000000000000000000000000C1865A53609eaEC415b530632F43F4297392b224,
        0x0000000000000000000000002b6e6e4def77583229299cf386438a227e683b28,
        0x000000000000000000000000AaC9B5c6bC7D8bE29A4021138f8A0b29e557Ff90,
        0x000000000000000000000000bB389e252bDf9d55332D217d9FE06bED43b23c2f,
        0x000000000000000000000000C1D73ed52f810dB8A2C1a5785C5b743F1996DbB4,
        0x00000000000000000000000015Eb4Cbc2C53bf6CDBE49711E8b2E97D2712439a,
        0x000000000000000000000000B5afC2F8836682AFD5A711Ad555e7FD55ec38a20,
        0x000000000000000000000000060aeca503f7383Fe8FBA8c9659ee0b8bf637077,
        0x0000000000000000000000000232fCa3F2E8bb567e851151c396cEB3D0D47c11,
        0x000000000000000000000000821cfB3921Bae561fbF9527fdc5A4285468740AA,
        0x000000000000000000000000b10c5381fC00Bc8296016EC21B7E29a852414c48
      )
      AND l.block_time >= from_unixtime(${options.startTimestamp})
      AND l.block_time < from_unixtime(${options.endTimestamp})
    )
    
    SELECT
      (SELECT revenue_usd FROM bnb_received) + (SELECT revenue_usd FROM token_received) AS daily_revenue_usd,
      (SELECT fees_usd FROM bnb_received) + (SELECT fees_usd FROM token_received) AS daily_fees_usd
  `
  
  const result = await queryDuneSql(options, query)
  const dailyFees = options.createBalances()
  const dailyRevenue = options.createBalances()
  
  if (result && result.length > 0) {
    dailyFees.addUSDValue(result[0].daily_fees_usd)
    dailyRevenue.addUSDValue(result[0].daily_revenue_usd)
  }

  return { dailyFees, dailyRevenue }
};
  
//   const result = await queryDuneSql(options, query)

//   const dailyFees = options.createBalances()
//   const dailyRevenue = options.createBalances()
  
//   if (result && result.length > 0) {
//     dailyFees.addGasToken(result[0].daily_fees_usd)
//     dailyRevenue.addGasToken(result[0].daily_revenue_usd)
//   }

//   return { dailyFees, dailyRevenue }
// };

  // const dailyRevenue = await addTokensReceived({
  //   options, targets: feeReceiverMultisig,
  //   fromAdddesses: fromAddresses,
  //   skipIndexer: true
  // })

  // await addGasTokensReceived({ multisigs: feeReceiverMultisig, balances: dailyRevenue, options, fromAddresses })

  // const dailyFees = dailyRevenue.clone()
  // await getETHReceived({ options, balances: dailyFees, target: revshareWallet })
  // await addTokensReceived({
  //   options, targets: [
  //     revshareWallet
  //   ],
  //   fromAdddesses: fromAddresses,
  //   balances: dailyFees,
  //   skipIndexer: true
  // })

//   if (result && result.length > 0) {
//     dailyFees.addGasToken(result[0].daily_fees_usd)
//     dailyRevenue.addGasToken(result[0].daily_revenue_usd)
//   }
// 
//   return { dailyFees, dailyRevenue }
// };

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.BSC],
  start: '2024-12-25',
  dependencies: [Dependencies.DUNE],
  isExpensiveAdapter: true,
  methodology: {
    Fees: 'All fees paid by users for launching, trading tokens.',
    Revenue: 'Fees collected by four.meme protocol.',
  }
};
export default adapter;
