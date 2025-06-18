import { Adapter, FetchOptions, FetchResultV2 } from "../../adapters/types";
import { getConfig } from "../../helpers/cache";
import { CHAIN } from "../../helpers/chains";
import { addTokensReceived, nullAddress } from "../../helpers/token";

const methodology = {
  Fees: "Sum of all fees",
  Revenue: "Sum of all revenue",
};

async function fetch(options: FetchOptions): Promise<FetchResultV2> {
  const dailyFees = options.createBalances();

  const res = await getConfig(
    "yala/ethereum",
    "https://raw.githubusercontent.com/yalaorg/yala-defillama/refs/heads/main/config.json"
  );

  const dailySupplySideRevenue = options.createBalances();
  await addTokensReceived({
    options,
    targets: [res.ethereum.StabilityPool],
    tokens: [res.ethereum.YU],
    balances: dailySupplySideRevenue,
    fromAdddesses: [nullAddress],
  });
  dailyFees.addBalances(dailySupplySideRevenue);

  const dailyProtocolRevenue = options.createBalances();
  await addTokensReceived({
    options,
    targets: [...res.ethereum.FeeReceivers],
    tokens: [res.ethereum.YU],
    balances: dailyProtocolRevenue,
    fromAdddesses: [nullAddress],
  });
  dailyFees.addBalances(dailyProtocolRevenue);

  return {
    dailyFees,
    dailyRevenue: dailyProtocolRevenue,
  };
}

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch,
      start: "2025-05-16",
      meta: {
        methodology,
      },
    },
  },
};

export default adapter;
