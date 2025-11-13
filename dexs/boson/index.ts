import { Adapter, FetchOptions, FetchResultV2 } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getEncumberedFunds, getNewOffers, getReservedRanges } from "./utils";

async function getProtocolVolume(
  options: FetchOptions
): Promise<FetchResultV2> {
  const { createBalances } = options;
  const dailyVolume = createBalances();

  const volumeByToken: Record<string, bigint> = {};

  await getEncumberedFunds(options, volumeByToken);
  await getNewOffers(options, volumeByToken);
  await getReservedRanges(options, volumeByToken);

  for (const [token, amount] of Object.entries(volumeByToken)) {
    dailyVolume.add(token, amount);
  }

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
      "Sum of funds encumbered in exchanges and total value of newly created offers on the Boson Protocol.",
  },
};

export default adapter;
