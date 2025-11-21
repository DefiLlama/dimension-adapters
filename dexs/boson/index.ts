import { Adapter, FetchOptions, FetchResultV2 } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getEncumberedFunds, getNewOffers } from "./utils";

async function getProtocolVolume(
  options: FetchOptions
): Promise<FetchResultV2> {
  const { createBalances } = options;
  const dailyVolume = createBalances();

  await getEncumberedFunds(options, dailyVolume);
  await getNewOffers(options, dailyVolume);

  return {
    dailyVolume,
  };
}

const adapter: Adapter = {
  fetch: getProtocolVolume,
  adapter: {
    [CHAIN.POLYGON]: { start: "2022-10-12" },
    [CHAIN.ETHEREUM]: { start: "2023-09-29" },
    [CHAIN.BASE]: { start: "2025-01-31" },
    [CHAIN.ARBITRUM]: { start: "2025-04-01" },
    [CHAIN.OPTIMISM]: { start: "2025-03-10" },
  },
  version: 2,
  methodology: {
    Volume:
      "Sum of funds deposited and, sum of prices of newly created offers",
  },
};

export default adapter;
