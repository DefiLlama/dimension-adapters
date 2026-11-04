import ADDRESSES from '../../helpers/coreAssets.json'
import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from '../../helpers/dune';

// Trades emit on TokenManager V1 (BNB) and TokenManager2 (BNB or ERC-20 quote), regardless of router.
const WBNB = ADDRESSES.bsc.WBNB

const TOKEN_MANAGER_V2 = '0x5c952063c7fc8610ffdb798152d69f0b9550762b'
const TOKEN_INFOS = 'function _tokenInfos(address) view returns (address base, address quote, uint256 template, uint256 totalSupply, uint256 maxOffers, uint256 maxRaising, uint256 launchTime, uint256 offers, uint256 funds, uint256 lastPrice, uint256 K, uint256 T, uint256 status)'

// OpenFour (the launch engine introduced by Four.Meme), https://github.com/four-meme-community/openfour-docs: every curve
// trade emits TradeExecuted on Core with the quote asset. Volume is what the trader put in: traderQuoteAmount on buys
// (curve amount plus fees), curveQuoteAmount on sells (before fees), per the guide's §10.2 amount relationships.
// Sample tx 0x2c906e792ae2c6ad84efbfe23212d8a5fb335a20720ac95a96ace695172ba6d3: curve trade of 150.625 BNC4.
// TapeFour (presetId 1778027615734) curve trades are NAND NFT fundraising, which the OpenFour integration guide says to
// keep out of ERC-20 volume.
const OPENFOUR_CORE = '0xebe7b6c1089d9f72ad07f34e36d898e44e5e27f3'
const TAPEFOUR_PRESET_TOPIC = '0x0000000000000000000000000000000000000000000000000000019dfab455f6' // presetId 1778027615734

// Quote token: read per curve from TokenManager2._tokenInfos; address(0) means BNB.
const fetch = async (options: FetchOptions) => {
  const query = `
    WITH v2_trades AS (
      SELECT token, cost FROM four_meme_bnb.tokenmanager2_evt_tokenpurchase
      WHERE evt_block_time >= from_unixtime(${options.startTimestamp}) AND evt_block_time < from_unixtime(${options.endTimestamp})
      UNION ALL
      SELECT token, cost FROM four_meme_bnb.tokenmanager2_evt_tokensale
      WHERE evt_block_time >= from_unixtime(${options.startTimestamp}) AND evt_block_time < from_unixtime(${options.endTimestamp})
    ),
    v1_trades AS (
      SELECT etheramount AS amount FROM four_meme_bnb.tokenmanager_evt_tokenpurchase
      WHERE evt_block_time >= from_unixtime(${options.startTimestamp}) AND evt_block_time < from_unixtime(${options.endTimestamp})
      UNION ALL
      SELECT etheramount AS amount FROM four_meme_bnb.tokenmanager_evt_tokensale
      WHERE evt_block_time >= from_unixtime(${options.startTimestamp}) AND evt_block_time < from_unixtime(${options.endTimestamp})
    )
    SELECT 'v2' AS src, lower('0x' || to_hex(token)) AS token, CAST(SUM(cost) AS varchar) AS amount FROM v2_trades GROUP BY 2
    UNION ALL
    SELECT 'v1' AS src, 'v1' AS token, CAST(SUM(amount) AS varchar) AS amount FROM v1_trades
    UNION ALL
    -- OpenFour: quoteAsset, and traderQuoteAmount on buys / curveQuoteAmount on sells, from TradeExecuted
    SELECT 'openfour' AS src, lower('0x' || to_hex(bytearray_substring(data, 45, 20))) AS token,
      CAST(SUM(CASE WHEN bytearray_to_uint256(bytearray_substring(data, 1, 32)) = 1
        THEN bytearray_to_uint256(bytearray_substring(data, 193, 32))
        ELSE bytearray_to_uint256(bytearray_substring(data, 161, 32)) END) AS varchar) AS amount
    FROM bnb.logs
    WHERE contract_address = ${OPENFOUR_CORE}
      AND topic0 = keccak(to_utf8('TradeExecuted(address,address,uint256,bool,address,address,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256)'))
      AND topic3 <> ${TAPEFOUR_PRESET_TOPIC}
      AND block_time >= from_unixtime(${options.startTimestamp}) AND block_time < from_unixtime(${options.endTimestamp})
    GROUP BY 2
  `

  const dailyVolume = options.createBalances()
  const rows = await queryDuneSql(options, query)
  const v2Rows = rows.filter((row: any) => row.src === 'v2' && row.amount)
  const tokenInfos = await options.api.multiCall({ target: TOKEN_MANAGER_V2, abi: TOKEN_INFOS, calls: v2Rows.map((row: any) => row.token) })
  v2Rows.forEach((row: any, i: number) => {
    const quote = tokenInfos[i].quote.toLowerCase()
    dailyVolume.add(quote === ADDRESSES.null ? WBNB : quote, row.amount)
  })
  const v1Row = rows.find((row: any) => row.src === 'v1')
  if (v1Row?.amount) dailyVolume.add(WBNB, v1Row.amount)
  rows.filter((row: any) => row.src === 'openfour' && row.amount).forEach((row: any) => dailyVolume.add(row.token, row.amount))

  return { dailyVolume }
}

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.BSC],
  start: '2024-12-25',
  dependencies: [Dependencies.DUNE],
  isExpensiveAdapter: true,
  methodology: {
    Volume: "Sum of every buy and sell on four.meme's V1 and V2 bonding curves, taken from the on-chain TokenPurchase/TokenSale events. Each trade's cost is valued in the quote token TokenManager2 records for that curve: BNB, a stablecoin, or any other ERC-20 such as the tokenized stocks some curves are priced in. Plus OpenFour bonding-curve trades in the trade's quote asset (TradeExecuted: what the buyer paid including fees, and the seller's amount before fees), except TapeFour NFT fundraising.",
  },
}

export default adapter
