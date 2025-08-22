import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { addTokensReceived } from "../../helpers/token";
import BigNumber from "bignumber.js";

const fetch = async (options: FetchOptions) => {
  const holdersB = await addTokensReceived({
    options,
    target: "0x6499Add1cC6223Aeec0BD9e5355EfE10ceF519C5", //vlPEAS wallet
    token:  "0x02f92800f57bcd74066f5709f1daa1a4302df875", //PEAS token
  });

  const protocolB = await addTokensReceived({
    options,
    target: "0xc64bc02594ba7f777f26b7a1eec6e6dc4a56362b", //protocol multiSig
    fromAdddesses: ["0x88eaFE23769a4FC2bBF52E77767C3693e6acFbD5"], //revenue wallet
  });

  const totalB = holdersB.clone();
  totalB.addBalances(protocolB);

  return {
    dailyFees:            totalB,
    dailyUserFees:        totalB,
    dailyRevenue:         totalB,
    dailyProtocolRevenue: protocolB,
    dailyHoldersRevenue:  holdersB,
  };
};

const methodology = {
  Fees: "Includes interest paid, auto-compounding LP yields, liquidation proceeds, and LVF open/close actions.",
  Revenue: "Revenue is collected in a wide variety of different tokens and converted to blue chip assets to be kept as protocol revenue (40%) and converted to PEAS for holders revenue (60%).",
  ProtocolRevenue: "Protocol revenue is sent to the protocol multisig, covering overhead and team compensation.",
  HoldersRevenue: "Holders revenue is sent to the vlPEAS wallet in the form of PEAS tokens, of which 5% is burned and the remainder distributed to the vlPEAS holders’ fund.",
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.ETHEREUM]: { fetch, start: "2025-04-16" },
    [CHAIN.ARBITRUM]: { fetch, start: "2025-04-16" },
    [CHAIN.BASE]: { fetch, start: "2025-04-16" },
    [CHAIN.SONIC]: { fetch, start: "2025-04-16" },
    [CHAIN.BERACHAIN]: { fetch, start: "2025-04-16" },
  },
};
export default adapter;
