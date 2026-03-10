import { SimpleAdapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const EXCHANGE = "0x34B6552d57a35a1D042CcAe1951BD1C370112a6F";
const PERP_IDS = [1, 10]; // BTC, MON

const getPerpetualInfoAbi =
  "function getPerpetualInfo(uint256 perpId) view returns ((string name, string symbol, uint256 priceDecimals, uint256 lotDecimals, bytes32 linkFeedId, uint256 priceTolPer100K, uint256 marginTol, uint256 marginTolDecimals, uint256 refPriceMaxAgeSec, uint256 positionBalanceCNS, uint256 insuranceBalanceCNS, uint256 markPNS, uint256 markTimestamp, uint256 lastPNS, uint256 lastTimestamp, uint256 oraclePNS, uint256 oracleTimestampSec, uint256 longOpenInterestLNS, uint256 shortOpenInterestLNS))";

const fetch = async (options: FetchOptions) => {
  const results = await options.api.multiCall({
    abi: getPerpetualInfoAbi,
    target: EXCHANGE,
    calls: PERP_IDS.map((id) => ({ params: [id] })),
  });

  let openInterestAtEnd = 0;

  for (const info of results) {
    const priceDecimals = Number(info.priceDecimals);
    const lotDecimals = Number(info.lotDecimals);
    const markPrice = Number(info.markPNS) / 10 ** priceDecimals;
    const longOI = Number(info.longOpenInterestLNS) / 10 ** lotDecimals;
    const shortOI = Number(info.shortOpenInterestLNS) / 10 ** lotDecimals;
    openInterestAtEnd += (longOI + shortOI) * markPrice;
  }

  return { openInterestAtEnd };
};

const adapter: SimpleAdapter = {
  version: 2,
  chains: [CHAIN.MONAD],
  fetch,
  start: "2025-02-01",
  runAtCurrTime: true,
};

export default adapter;
