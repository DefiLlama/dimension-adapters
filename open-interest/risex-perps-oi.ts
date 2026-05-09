import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const PERPS_MANAGER = "0x53f10facfc8965750494e6965f5d6da39b41d852";
const RISEX_ORACLE = "0x8fC4D0Cf74cdF595254cB763d4C05D38Df0e9503";

// Source: RiseX Perps contract interface docs list getTotalMarkets and getOpenInterest on PerpsManager.
const GET_TOTAL_MARKETS_ABI = "function getTotalMarkets() view returns (uint256)";
const GET_OPEN_INTEREST_ABI = "function getOpenInterest(uint16 marketId) view returns (uint256)";
// Source: official RISExOracle ABI exposes historical mark prices by market ID.
const GET_MARK_PRICE_ABI = "function getMarkPrice(uint16 marketId) view returns (uint256)";
const WAD = 1e18;

const fetch = async (options: FetchOptions) => {
  const totalMarkets = await options.toApi.call({ target: PERPS_MANAGER, abi: GET_TOTAL_MARKETS_ABI });
  const marketIds = Array.from({ length: Number(totalMarkets) }, (_, i) => i + 1);

  const [openInterests, markPrices] = await Promise.all([
    options.toApi.multiCall({
      target: PERPS_MANAGER,
      abi: GET_OPEN_INTEREST_ABI,
      calls: marketIds.map((marketId) => ({ params: [marketId] })),
    }),
    options.toApi.multiCall({
      target: RISEX_ORACLE,
      abi: GET_MARK_PRICE_ABI,
      calls: marketIds.map((marketId) => ({ params: [marketId] })),
    }),
  ]);

  const openInterestAtEnd = openInterests.reduce((total: number, openInterest: any, i: number) => {
    const baseOpenInterest = Number(openInterest) / WAD;
    const markPrice = Number(markPrices[i]) / WAD;
    return total + baseOpenInterest * markPrice;
  }, 0);

  return { openInterestAtEnd };
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.RISE],
  start: "2026-04-01",
};

export default adapter;
