import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import {
  fetchMarketsById,
  fetchOrderFills,
  fetchPrmInfosById,
  getDedupedFillAmounts,
  PREMARKET_START_DATE,
  prmTokenIdFromAnyTokenId,
} from "../../helpers/premarket";

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const dailyNotionalVolume = options.createBalances();

  const fills = await fetchOrderFills(options);
  const marketsById = await fetchMarketsById(
    fills.map((fill) => fill.marketId ?? ""),
  );
  const prmInfosById = await fetchPrmInfosById(
    fills
      .map((fill) => prmTokenIdFromAnyTokenId(fill.optionTokenId))
      .filter((id): id is string => !!id),
  );

  for (const amount of getDedupedFillAmounts(fills, marketsById, prmInfosById)) {
    if (amount.volumeAmount > 0n) {
      dailyVolume.add(amount.volumeToken, amount.volumeAmount);
    }

    if (amount.notionalAmount > 0n) {
      dailyNotionalVolume.add(amount.notionalToken, amount.notionalAmount);
    }
  }

  return {
    dailyVolume,
    dailyNotionalVolume,
  };
};

const methodology = {
  Volume:
    "Collateral/cash-side value exchanged in Premarket order fills, deduplicating matched orders that emit two fill records for one economic trade.",
  NotionalVolume:
    "Outcome exposure traded. ERC6909 outcome-token fills are converted to collateral-denominated notional using indexed market tick, tick spacing, tokens-per-tick-size, and PRM metadata.",
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.MEGAETH],
  start: PREMARKET_START_DATE,
  methodology,
  pullHourly: true,
};

export default adapter;
