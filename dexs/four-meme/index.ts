import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from '../../helpers/dune';

const feeReceiverMultisig = [
  "0x48735904455eDa3aa9a0c9e43EE9999c795E30b9",
  "0x55d571b7475F4382C2a15D24A7C864cA679407c4",
  "0x60Be34554F193f4f6862b0E12DC16BA30163D6d0",
  "0x31120f443365efa63330d2D962f537aE28f0d672",
  "0xf89b36B36A634745eEFbbF17d5F777A494F8B6F7",
  "0xC1865A53609eaEC415b530632F43F4297392b224",
  "0xAaC9B5c6bC7D8bE29A4021138f8A0b29e557Ff90",
  "0xbB389e252bDf9d55332D217d9FE06bED43b23c2f",
  "0xC1D73ed52f810dB8A2C1a5785C5b743F1996DbB4",
  "0x15Eb4Cbc2C53bf6CDBE49711E8b2E97D2712439a",
  "0xB5afC2F8836682AFD5A711Ad555e7FD55ec38a20",
  "0x060aeca503f7383Fe8FBA8c9659ee0b8bf637077",
  "0x0232fCa3F2E8bb567e851151c396cEB3D0D47c11",
  "0x821cfB3921Bae561fbF9527fdc5A4285468740AA",
  "0xb10c5381fC00Bc8296016EC21B7E29a852414c48"
] // source: https://dune.com/queries/4068894/6851717

const fromAddresses = [
  "0xEC4549caDcE5DA21Df6E6422d448034B5233bFbC",
  "0x5c952063c7fc8610FFDB798152D69F0B9550762b"
]

const fetch = async (_a:any, _b:any, options: FetchOptions) => {
  const query = `
    SELECT
      COALESCE(SUM(p.price * (CAST(bytearray_to_uint256(bytearray_substring(l.data, 1, 32)) AS DOUBLE) / 1e18)), 0) AS daily_fees_usd
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
  `

  let dailyVolume = options.createBalances()
  const result = await queryDuneSql(options, query)

  if (result && result.length > 0) {
    dailyVolume.addUSDValue(result[0].daily_fees_usd * 100)
  }

  // await addGasTokensReceived({ multisigs: feeReceiverMultisig, balances: dailyVolume, options, fromAddresses })
  // dailyVolume = dailyVolume.resizeBy(100) // because of 1% fixed platform fee as per docs

  return { dailyVolume }
}

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.BSC],
  start: '2024-12-25',
  dependencies: [Dependencies.DUNE],
  isExpensiveAdapter: true,
}

export default adapter
