import ADDRESSES from '../helpers/coreAssets.json'
import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryDuneSql } from "../helpers/dune";
import { METRIC } from "../helpers/metrics";
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

// OpenFour, the launch engine introduced by Four.Meme (https://github.com/four-meme-community/openfour-docs, integration guide §13):
// its FeeRouter 0x7383B244B416Db16Aa9dd0AB7C296Aa60255B9A2 sends 5% of each protocol fee to the same rebate wallet 0x2b6e6e...
// (FeeAssigned kind 6) and the rest of the protocol fee, plus the protocol share of migration fees (kinds 1 and 4), to the
// OpenFour treasury 0x7cf6b1c47b4a199a4af6da22726c2c8bfa64a3f1, as ERC-20 transfers in the quote token.
// Sample tx 0x2c906e792ae2c6ad84efbfe23212d8a5fb335a20720ac95a96ace695172ba6d3: trade fee 1.506 BNC4, 1.431 to treasury, 0.075 to rebate wallet.
// Sample tx 0x982e1f1dafe3b3b6ae122fd6205783b01e34abb7b5dea28df0bbb93e6d6144da: migration fee, 0.121 WBNB to treasury.
// Developer fees and partner shares (kind 7) accrue as claimable balances, the creator gets its share of migration fees
// (kind 5) and early buys can pay an anti-sniper fee that the vault keeps for its migration buyback: these are fees paid
// to others, booked when assigned (guide §10.2, §10.6, §13); later claims are not read. Token taxes (kind 3) are not fees.

const fetch: any = async (options: FetchOptions) => {
  const query = `
    WITH bnb_received AS (
      SELECT
        COALESCE(CAST(SUM(CASE WHEN l.contract_address != 0x2b6e6e4def77583229299cf386438a227e683b28 
          THEN bytearray_to_uint256(bytearray_substring(l.data, 1, 32)) END) AS varchar), '0') AS revenue,
        COALESCE(CAST(SUM(bytearray_to_uint256(bytearray_substring(l.data, 1, 32))) AS varchar), '0') AS fees
      FROM bnb.logs l
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
        l.contract_address AS token,
        COALESCE(CAST(SUM(CASE WHEN l.topic2 != 0x0000000000000000000000002b6e6e4def77583229299cf386438a227e683b28 
          THEN bytearray_to_uint256(bytearray_substring(l.data, 1, 32)) END) AS varchar), '0') AS revenue,
        COALESCE(CAST(SUM(bytearray_to_uint256(bytearray_substring(l.data, 1, 32))) AS varchar), '0') AS fees
      FROM bnb.logs l
      WHERE l.topic0 = 0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef
      AND ((l.topic1 IN (
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
      ))
      -- OpenFour FeeRouter -> OpenFour treasury / rebate wallet
      OR (l.topic1 = 0x0000000000000000000000007383B244B416Db16Aa9dd0AB7C296Aa60255B9A2
      AND l.topic2 IN (
        0x0000000000000000000000007cf6b1c47b4a199a4af6da22726c2c8bfa64a3f1,
        0x0000000000000000000000002b6e6e4def77583229299cf386438a227e683b28
      )))
      AND l.block_time >= from_unixtime(${options.startTimestamp})
      AND l.block_time < from_unixtime(${options.endTimestamp})
      GROUP BY 1
    ),

    openfour_accrued AS (
      SELECT quote AS token, label, CAST(SUM(amount) AS varchar) AS fees
      FROM (
        -- TradeExecuted data words (32 bytes each, byte offsets 1-based): quoteAsset is the address in word 1 (byte 45),
        -- devFee is word 11 (byte 353) and antiSniperFee word 12 (byte 385)
        SELECT bytearray_substring(t.data, 45, 20) AS quote, f.label, bytearray_to_uint256(bytearray_substring(t.data, f.pos, 32)) AS amount
        FROM bnb.logs t
        CROSS JOIN (VALUES ('Developer Fees', 353), ('Anti-Sniper Fees', 385)) AS f(label, pos)
        WHERE t.contract_address = 0xebe7b6c1089d9f72ad07f34e36d898e44e5e27f3
          AND t.topic0 = keccak(to_utf8('TradeExecuted(address,address,uint256,bool,address,address,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256)'))
          AND t.block_time >= from_unixtime(${options.startTimestamp})
          AND t.block_time < from_unixtime(${options.endTimestamp})
        UNION ALL
        SELECT bytearray_substring(topic2, 13, 20),
          CASE WHEN bytearray_to_uint256(topic3) = 5 THEN '${METRIC.CREATOR_FEES}' ELSE 'Partner Fees' END,
          bytearray_to_uint256(bytearray_substring(data, 33, 32))
        FROM bnb.logs
        WHERE contract_address = 0x7383b244b416db16aa9dd0ab7c296aa60255b9a2
          AND topic0 = keccak(to_utf8('FeeAssigned(address,address,address,uint8,uint256,bool)'))
          AND bytearray_to_uint256(topic3) IN (5, 7)
          AND block_time >= from_unixtime(${options.startTimestamp})
          AND block_time < from_unixtime(${options.endTimestamp})
      ) a
      WHERE amount > 0
      GROUP BY 1, 2
    )
    
    SELECT 'bnb' AS token, CAST(NULL AS varchar) AS label, fees, revenue FROM bnb_received
    UNION ALL
    SELECT lower('0x' || to_hex(token)) AS token, CAST(NULL AS varchar) AS label, fees, revenue FROM token_received
    UNION ALL
    SELECT lower('0x' || to_hex(token)) AS token, label, fees, '0' AS revenue FROM openfour_accrued
  `
  
  const rows = await queryDuneSql(options, query)
  const dailyFees = options.createBalances()
  const dailyRevenue = options.createBalances()
  const dailySupplySideRevenue = options.createBalances()
  
  for (const row of rows) {
    if (row.label) {
      // OpenFour fees paid to developers, partners, creators and the anti-sniper buyback
      dailyFees.add(row.token, row.fees, row.label)
      dailySupplySideRevenue.add(row.token, row.fees, row.label)
      continue
    }
    const rebates = (BigInt(row.fees) - BigInt(row.revenue)).toString()
    if (row.token === 'bnb') {
      dailyFees.addGasToken(row.fees, METRIC.TRADING_FEES)
      dailyRevenue.addGasToken(row.revenue, METRIC.PROTOCOL_FEES)
      dailySupplySideRevenue.addGasToken(rebates, 'Rebates')
    } else {
      dailyFees.add(row.token, row.fees, METRIC.TRADING_FEES)
      dailyRevenue.add(row.token, row.revenue, METRIC.PROTOCOL_FEES)
      dailySupplySideRevenue.add(row.token, rebates, 'Rebates')
    }
  }

  return { dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue, dailySupplySideRevenue }
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
    Fees: 'All fees paid by users for launching, trading tokens, on the classic four.meme curves and on OpenFour (including TapeFour), including OpenFour developer, partner, creator migration and anti-sniper fees. Excludes token taxes.',
    Revenue: 'Fees collected by four.meme protocol, including the OpenFour treasury share of OpenFour protocol and migration fees.',
    ProtocolRevenue: 'Fees retained by the four.meme protocol after rev-share distributions, the same as revenue.',
    SupplySideRevenue: 'Rebates sent to the rev-share wallet, and OpenFour developer fees, partner shares, creator shares of migration fees and anti-sniper fees.',
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.TRADING_FEES]: "USD value of all BNB and token fees collected from token launches and trades, including rev-share distributions",
      'Developer Fees': "OpenFour fees paid to the preset author or module developer on each trade (TradeExecuted devFee), accrued as claimable balances",
      'Partner Fees': "OpenFour partner share of the post-rebate protocol fee (FeeAssigned kind 7), accrued as claimable balances",
      [METRIC.CREATOR_FEES]: "OpenFour creator share of migration fees (FeeAssigned kind 5)",
      'Anti-Sniper Fees': "OpenFour surcharge on early buys (TradeExecuted antiSniperFee), kept by the vault for its migration buyback",
    },
    Revenue: {
      [METRIC.PROTOCOL_FEES]: "USD value of fees retained by the four.meme protocol after excluding rev-share wallet distributions",
    },
    ProtocolRevenue: {
      [METRIC.PROTOCOL_FEES]: "USD value of fees retained by the four.meme protocol after excluding rev-share wallet distributions",
    },
    SupplySideRevenue: {
      'Rebates': "Share of the protocol fee sent to the rev-share wallet 0x2b6e6e... (5% on OpenFour, FeeAssigned kind 6)",
      'Developer Fees': "OpenFour fees paid to the preset author or module developer on each trade (TradeExecuted devFee), accrued as claimable balances",
      'Partner Fees': "OpenFour partner share of the post-rebate protocol fee (FeeAssigned kind 7), accrued as claimable balances",
      [METRIC.CREATOR_FEES]: "OpenFour creator share of migration fees (FeeAssigned kind 5)",
      'Anti-Sniper Fees': "OpenFour surcharge on early buys (TradeExecuted antiSniperFee), kept by the vault for its migration buyback",
    },
  },
};
export default adapter;
