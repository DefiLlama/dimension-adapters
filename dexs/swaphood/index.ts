import {
  FetchOptions,
  FetchResponseValue,
  FetchResult,
  FetchV2,
  SimpleAdapter,
} from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import swaphoodV2 from "./swaphood";
import swaphoodV3 from "./swaphood-v3";

function requireFetch(
  adapter: SimpleAdapter,
  version: string,
): FetchV2 {
  if (adapter.fetch) return adapter.fetch;

  const chainFetch = adapter.adapter?.[CHAIN.ROBINHOOD]?.fetch;

  if (chainFetch) return chainFetch;

  throw new Error(`Missing SwapHood ${version} fetch function`);
}

const fetchV2 = requireFetch(swaphoodV2, "V2");
const fetchV3 = requireFetch(swaphoodV3, "V3");

function addResponseValue(
  balances: ReturnType<FetchOptions["createBalances"]>,
  value: FetchResponseValue | undefined,
): void {
  if (value === undefined) return;

  if (typeof value === "string" || typeof value === "number") {
    balances.addUSDValue(value);
    return;
  }

  balances.addBalances(value);
}

const fetch = async (
  options: FetchOptions,
): Promise<FetchResult> => {
  const [v2Stats, v3Stats] = await Promise.all([
    fetchV2(options),
    fetchV3(options),
  ]);

  const dailyVolume = options.createBalances();

  addResponseValue(dailyVolume, v2Stats.dailyVolume);
  addResponseValue(dailyVolume, v3Stats.dailyVolume);

  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ROBINHOOD],
  start: "2026-07-10",
  methodology: {
    Volume:
      "Combined swap volume from SwapHood V2 pairs and SwapHood V3 pools on Robinhood Chain.",
  },
};

export default adapter;
