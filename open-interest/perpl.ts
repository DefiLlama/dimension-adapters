import { SimpleAdapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const EXCHANGE = "0x34B6552d57a35a1D042CcAe1951BD1C370112a6F";

// Probe perpIds 1..MAX_PERP_ID to discover all active markets dynamically.
// PerpIds are sparse (e.g. 1=BTC, 10=MON, 20=ETH, 30=SOL) with gaps of ~10.
const MAX_PERP_ID = 100;

const getPerpetualInfoAbi =
  "function getPerpetualInfo(uint256 perpId) view returns ((string name, string symbol, uint256 priceDecimals, uint256 lotDecimals, bytes32 linkFeedId, uint256 priceTolPer100K, uint256 marginTol, uint256 marginTolDecimals, uint256 refPriceMaxAgeSec, uint256 positionBalanceCNS, uint256 insuranceBalanceCNS, uint256 markPNS, uint256 markTimestamp, uint256 lastPNS, uint256 lastTimestamp, uint256 oraclePNS, uint256 oracleTimestampSec, uint256 longOpenInterestLNS, uint256 shortOpenInterestLNS))";

const fetch = async (options: FetchOptions) => {
  const perpIds = Array.from({ length: MAX_PERP_ID }, (_, i) => i + 1);
  const results = await options.api.multiCall({
    abi: getPerpetualInfoAbi,
    target: EXCHANGE,
    calls: perpIds.map((id) => ({ params: [id] })),
    permitFailure: true,
  });

  let longOpenInterestAtEnd = 0;
  let shortOpenInterestAtEnd = 0;

  for (const info of results) {
    if (!info) continue;
    const priceDecimals = Number(info.priceDecimals);
    const lotDecimals = Number(info.lotDecimals);
    const markPrice = Number(info.markPNS) / 10 ** priceDecimals;
    const longOI = Number(info.longOpenInterestLNS) / 10 ** lotDecimals;
    const shortOI = Number(info.shortOpenInterestLNS) / 10 ** lotDecimals;
    longOpenInterestAtEnd += longOI * markPrice;
    shortOpenInterestAtEnd += shortOI * markPrice;
  }
  const openInterestAtEnd = longOpenInterestAtEnd + shortOpenInterestAtEnd;

  return { longOpenInterestAtEnd, shortOpenInterestAtEnd, openInterestAtEnd };
};

const adapter: SimpleAdapter = {
  version: 2,
  chains: [CHAIN.MONAD],
  fetch,
  start: "2026-02-12",
};

export default adapter;
