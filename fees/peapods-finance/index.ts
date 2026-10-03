import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { addTokensReceived } from "../../helpers/token";
import ADDRESSES from "../../helpers/coreAssets.json";

const PROTOCOL_MULTISIG = "0xc64bc02594ba7f777f26b7a1eec6e6dc4a56362b";
const COW_SETTLEMENT = "0x9008D19f58AAbD9eD0D60971565AA8510560ab41";
const WRAPPED_NATIVE: Record<string, string> = {
  [CHAIN.ETHEREUM]: ADDRESSES.ethereum.WETH,
  [CHAIN.ARBITRUM]: ADDRESSES.arbitrum.WETH,
  [CHAIN.BASE]: ADDRESSES.base.WETH,
  [CHAIN.SONIC]: ADDRESSES.sonic.wS,
  [CHAIN.BERACHAIN]: ADDRESSES.berachain.WBERA,
};

const fetch = async (options: FetchOptions) => {
  const holdersB = await addTokensReceived({
    options,
    target: "0x6499Add1cC6223Aeec0BD9e5355EfE10ceF519C5", //vlPEAS wallet
    token:  "0x02f92800f57bcd74066f5709f1daa1a4302df875", //PEAS token
  });

  const protocolB = await addTokensReceived({
    options,
    target: PROTOCOL_MULTISIG,
    // Revenue is sent by per-pod TokenRewards contracts that change as pods are
    // deployed, so restricting transfers to one sender omits valid revenue.
  });

  const minted = await addTokensReceived({
    options,
    target: PROTOCOL_MULTISIG,
    fromAddressFilter: ADDRESSES.null,
  });
  minted.removeTokenBalance(WRAPPED_NATIVE[options.chain]);
  const swapProceeds = await addTokensReceived({
    options,
    target: PROTOCOL_MULTISIG,
    fromAddressFilter: COW_SETTLEMENT,
  });
  protocolB.subtract(minted);
  protocolB.subtract(swapProceeds);

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
  ProtocolRevenue: "Protocol revenue is sent to the protocol multisig, covering overhead and team compensation. Tokens minted into the multisig by bridges, and the proceeds of its own CoW Protocol swaps, are the treasury moving funds it already holds and are not counted. Wrapping native gas tokens still counts, since native receipts are not tracked otherwise.",
  HoldersRevenue: "Holders revenue is sent to the vlPEAS wallet in the form of PEAS tokens, of which 5% is burned and the remainder distributed to the vlPEAS holders’ fund.",
};

const adapter: SimpleAdapter = {
  methodology,
  version: 2,
  pullHourly: true,
  adapter: {
    [CHAIN.ETHEREUM]: { fetch, start: "2025-04-16" },
    [CHAIN.ARBITRUM]: { fetch, start: "2025-04-16" },
    [CHAIN.BASE]: { fetch, start: "2025-04-16" },
    [CHAIN.SONIC]: { fetch, start: "2025-04-16" },
    [CHAIN.BERACHAIN]: { fetch, start: "2025-04-16" },
  },
};
export default adapter;
