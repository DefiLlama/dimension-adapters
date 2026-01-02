import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { addTokensReceived } from "../../helpers/token";

// Brewlabs token contracts
const brewlabsTokens: Record<string, string> = {
  [CHAIN.ETHEREUM]: "0xdAd33e12e61dC2f2692F2c12e6303B5Ade7277Ba",
  [CHAIN.BSC]: "0x6aAc56305825f712Fd44599E59f2EdE51d42C3e7",
};

// Treasury addresses that receive fees
const treasuryAddresses: Record<string, string> = {
  [CHAIN.ETHEREUM]: "0x64961Ffd0d84b2355eC2B5d35B0d8D8825A774dc",
  [CHAIN.BSC]: "0x5Ac58191F3BBDF6D037C6C6201aDC9F99c93C53A",
};

const fetch = async (options: FetchOptions) => {
  const tokenAddress = brewlabsTokens[options.chain];
  const treasuryAddress = treasuryAddresses[options.chain];

  // Use helper function to track token transfers to treasury
  const dailyFees = await addTokensReceived({
    options,
    tokens: [tokenAddress],
    targets: [treasuryAddress],
  });

  return {
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  };
};

const methodology = {
  Fees: "Fees are calculated by tracking transfers to treasury.",
  Revenue: "All protocol fees from Brewlabs token transfers to treasury.",
  ProtocolRevenue: "All protocol fees from Brewlabs token transfers to treasury.",
};

const adapter: SimpleAdapter = {
  version: 2,
  methodology,
  fetch,
  start: '2023-11-01',
  chains: [CHAIN.ETHEREUM, CHAIN.BSC],
};

export default adapter;
