// Note: 
// Currently, the main logic of our platform is still based on the Ethereum platform.
//
// On the Bitcoin side, it's just a cross-chain transfer process. The transaction fee is the fee for the transfer. 
// It has nothing to do with the platform, so it was not included.
//
// On the Solana side, for the time being, we also use LayerZero for cross-chain transfer of the stablecoin Yu. 
// Then, we participate in yield on some cooperating platforms. The transaction fees are not related to the platforms. 
// We are also developing native applications for Solana. Once they are launched, we will include these fees.

import { Adapter, FetchOptions, FetchResultV2 } from "../../adapters/types";
import { getConfig } from "../../helpers/cache";
import { CHAIN } from "../../helpers/chains";
import { addTokensReceived, nullAddress } from "../../helpers/token";

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
    dailyProtocolRevenue,
    // dailyHoldersRevenue: '0',  // For the time being, 'Holders Revenue' will not be displayed. It will be updated when the governance token goes live.
    dailySupplySideRevenue
  };
}

const methodology = {
  Fees: "Includes protocol fees from stability pool operations and YU token distributions on Ethereum. Fees consist of stability pool rewards and protocol fees collected by fee receivers in YU tokens.",
  Revenue: "Revenue comes from YU token distributions to fee receiver addresses on Ethereum.",
  ProtocolRevenue: "Protocol revenue comes from YU token distributions to fee receiver addresses on Ethereum.",
  SupplySideRevenue: "Supply-side revenue is from YU token rewards distributed to stability pool participants.",
};

const adapter: Adapter = {
  version: 2,
  methodology,
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch,
      start: "2025-05-16",
    },
  },
};

export default adapter;
