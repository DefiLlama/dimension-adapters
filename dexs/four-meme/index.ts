import ADDRESSES from '../../helpers/coreAssets.json'
import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from '../../helpers/dune';

// Trades emit on TokenManager V1 (BNB) and TokenManager2 (BNB or ERC-20 quote), regardless of router.
const WBNB = ADDRESSES.bsc.WBNB

const TOKEN_MANAGER_V2 = '0x5c952063c7fc8610ffdb798152d69f0b9550762b'
const TOKEN_INFOS = 'function _tokenInfos(address) view returns (address base, address quote, uint256 template, uint256 totalSupply, uint256 maxOffers, uint256 maxRaising, uint256 launchTime, uint256 offers, uint256 funds, uint256 lastPrice, uint256 K, uint256 T, uint256 status)'

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
    SELECT lower('0x' || to_hex(token)) AS token, CAST(SUM(cost) AS varchar) AS amount FROM v2_trades GROUP BY 1
    UNION ALL
    SELECT 'v1' AS token, CAST(SUM(amount) AS varchar) AS amount FROM v1_trades
  `

  const dailyVolume = options.createBalances()
  const rows = await queryDuneSql(options, query)
  const v2Rows = rows.filter((row: any) => row.token !== 'v1' && row.amount)
  const tokenInfos = await options.api.multiCall({ target: TOKEN_MANAGER_V2, abi: TOKEN_INFOS, calls: v2Rows.map((row: any) => row.token) })
  v2Rows.forEach((row: any, i: number) => {
    const quote = tokenInfos[i].quote.toLowerCase()
    dailyVolume.add(quote === ADDRESSES.null ? WBNB : quote, row.amount)
  })
  const v1Row = rows.find((row: any) => row.token === 'v1')
  if (v1Row?.amount) dailyVolume.add(WBNB, v1Row.amount)

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
    Volume: "Sum of every buy and sell on four.meme's V1 and V2 bonding curves, taken from the on-chain TokenPurchase/TokenSale events. Each trade's cost is valued in the quote token TokenManager2 records for that curve: BNB, a stablecoin, or any other ERC-20 such as the tokenized stocks some curves are priced in.",
  },
}

export default adapter
