import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { addTokensReceived } from "../../helpers/token";
import ADDRESSES from "../../helpers/coreAssets.json";
import { METRIC } from "../../helpers/metrics";

const PROTOCOL_MULTISIG = "0xc64bc02594ba7f777f26b7a1eec6e6dc4a56362b";
// Protocol fee collector (LVF fees, lending fee shares) that remits to the multisig; the protocol leg was originally restricted to it.
const REVENUE_WALLET = "0x88eafe23769a4fc2bbf52e77767c3693e6acfbd5";
const WRAPPED_NATIVE: Record<string, string> = {
  [CHAIN.ETHEREUM]: ADDRESSES.ethereum.WETH,
  [CHAIN.ARBITRUM]: ADDRESSES.arbitrum.WETH,
  [CHAIN.BASE]: ADDRESSES.base.WETH,
  [CHAIN.SONIC]: ADDRESSES.sonic.wS,
  [CHAIN.BERACHAIN]: ADDRESSES.berachain.WBERA,
};

const TO_TREASURY = `${METRIC.PROTOCOL_FEES} To Treasury`;
const TO_HOLDERS = `${METRIC.PROTOCOL_FEES} To vlPEAS Holders`;

// Protocol fees reach the multisig from per-pod TokenRewards contracts, which change as pods are deployed.
// The multisig also receives treasury movements (OTC trades, its own LP withdrawals and swap outputs, bridge
// mints), so a receipt only counts when its sender is a TokenRewards contract (its trackingToken's
// poolRewards() points back at it), the revenue wallet, or a wrap of the native gas token.
async function getProtocolRevenue(options: FetchOptions) {
  const receipts: { from: string, token: string, value: any }[] = [];
  await addTokensReceived({
    options,
    target: PROTOCOL_MULTISIG,
    logFilter: ({ from, token, value }) => {
      receipts.push({ from, token, value });
      return false;
    },
  });

  const senders = [...new Set(receipts.map(({ from }) => from))]
    .filter((from) => from !== ADDRESSES.null && from !== REVENUE_WALLET);
  const trackingTokens = await options.api.multiCall({ abi: "address:trackingToken", calls: senders, permitFailure: true });
  const candidates = senders.filter((_, i) => trackingTokens[i] && trackingTokens[i] !== ADDRESSES.null);
  const poolRewards = await options.api.multiCall({
    abi: "address:poolRewards",
    calls: candidates.map((sender) => trackingTokens[senders.indexOf(sender)]),
    permitFailure: true,
  });
  const tokenRewards = new Set(candidates.filter((sender, i) => poolRewards[i]?.toLowerCase() === sender));

  const wrappedNative = WRAPPED_NATIVE[options.chain].toLowerCase();
  const protocolRevenue = options.createBalances();
  receipts.forEach(({ from, token, value }) => {
    if (tokenRewards.has(from) || from === REVENUE_WALLET || (from === ADDRESSES.null && token === wrappedNative))
      protocolRevenue.add(token, value, TO_TREASURY);
  });
  return protocolRevenue;
}

const fetch = async (options: FetchOptions) => {
  const holdersRevenue = await addTokensReceived({
    options,
    target: "0x6499Add1cC6223Aeec0BD9e5355EfE10ceF519C5", //vlPEAS wallet
    token:  "0x02f92800f57bcd74066f5709f1daa1a4302df875", //PEAS token
  });
  const protocolRevenue = await getProtocolRevenue(options);

  const dailyFees = options.createBalances();
  dailyFees.addBalances(protocolRevenue, METRIC.PROTOCOL_FEES);
  dailyFees.addBalances(holdersRevenue, METRIC.PROTOCOL_FEES);

  const dailyHoldersRevenue = options.createBalances();
  dailyHoldersRevenue.addBalances(holdersRevenue, TO_HOLDERS);

  const dailyRevenue = options.createBalances();
  dailyRevenue.addBalances(protocolRevenue, TO_TREASURY);
  dailyRevenue.addBalances(dailyHoldersRevenue, TO_HOLDERS);

  return {
    dailyFees,
    dailyUserFees:        dailyFees.clone(),
    dailyRevenue,
    dailyProtocolRevenue: protocolRevenue,
    dailyHoldersRevenue,
  };
};

const methodology = {
  Fees: "Includes interest paid, auto-compounding LP yields, liquidation proceeds, and LVF open/close actions.",
  UserFees: "Same as Fees: the protocol share of interest, LP yields, liquidation proceeds and LVF open/close fees paid by users.",
  Revenue: "Revenue is collected in a wide variety of different tokens and converted to blue chip assets to be kept as protocol revenue (40%) and converted to PEAS for holders revenue (60%).",
  ProtocolRevenue: "Protocol revenue is sent to the protocol multisig by the per-pod TokenRewards contracts and the protocol revenue wallet, covering overhead and team compensation. Other tokens the multisig receives (OTC trades, its own LP withdrawals and swap outputs, bridge mints) are the treasury moving funds and are not counted. Wrapping native gas tokens still counts, since native receipts are not tracked otherwise.",
  HoldersRevenue: "Holders revenue is sent to the vlPEAS wallet in the form of PEAS tokens, of which 5% is burned and the remainder distributed to the vlPEAS holders’ fund.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.PROTOCOL_FEES]: "Protocol share of pod fees, lending interest, LP yields, liquidations and LVF actions, received by the protocol multisig and the vlPEAS wallet.",
  },
  UserFees: {
    [METRIC.PROTOCOL_FEES]: "Protocol share of pod fees, lending interest, LP yields, liquidations and LVF actions, received by the protocol multisig and the vlPEAS wallet.",
  },
  Revenue: {
    [TO_TREASURY]: "Fees sent to the protocol multisig by TokenRewards contracts and the revenue wallet.",
    [TO_HOLDERS]: "Fees converted to PEAS and sent to the vlPEAS wallet.",
  },
  ProtocolRevenue: {
    [TO_TREASURY]: "Fees sent to the protocol multisig by TokenRewards contracts and the revenue wallet.",
  },
  HoldersRevenue: {
    [TO_HOLDERS]: "Fees converted to PEAS and sent to the vlPEAS wallet.",
  },
};

const adapter: SimpleAdapter = {
  methodology,
  breakdownMethodology,
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
