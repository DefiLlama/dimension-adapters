import { SimpleAdapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const EXCHANGE = "0x34B6552d57a35a1D042CcAe1951BD1C370112a6F";

// Market config: perpId → { priceDecimals, lotDecimals }
const MARKETS: Record<number, { priceDecimals: number; lotDecimals: number }> = {
  1: { priceDecimals: 1, lotDecimals: 5 },   // BTC
  10: { priceDecimals: 6, lotDecimals: 0 },   // MON
};

const MakerOrderFilledEvent =
  "event MakerOrderFilled(uint256 perpId, uint256 accountId, uint256 orderId, uint256 pricePNS, uint256 lotLNS, uint256 feeCNS, uint256 lockedBalanceCNS, int256 amountCNS, uint256 balanceCNS)";

const fetch = async ({ getLogs }: FetchOptions) => {
  const makerLogs = await getLogs({ target: EXCHANGE, eventAbi: MakerOrderFilledEvent });

  let dailyVolume = 0;
  let dailyFees = 0;

  for (const log of makerLogs) {
    const perpId = Number(log.perpId);
    const market = MARKETS[perpId];
    if (!market) continue;

    // Volume: price * lots in USD
    const price = Number(log.pricePNS) / 10 ** market.priceDecimals;
    const lots = Number(log.lotLNS) / 10 ** market.lotDecimals;
    dailyVolume += price * lots;

    // Fees: feeCNS in AUSD (6 decimals, 1:1 USD)
    dailyFees += Number(log.feeCNS) / 1e6;
  }

  return { dailyVolume, dailyFees };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.MONAD]: {
      fetch,
      start: "2025-02-01",
    },
  },
};

export default adapter;
