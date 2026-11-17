import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { addTokensReceived } from "../../helpers/token";
import ADDRESSES from "../../helpers/coreAssets.json";
import { METRIC } from "../../helpers/metrics";
import { Interface } from "ethers";

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

// Multicall3 at its canonical address, deployed on all five chains before the adapter start (https://www.multicall3.com/deployments)
const MULTICALL3 = "0xcA11bde05977b3631167028862bE2a173976CA11";
const TRY_AGGREGATE = "function tryAggregate(bool requireSuccess, tuple(address target, bytes callData)[] calls) payable returns (tuple(bool success, bytes returnData)[] returnData)";
const GETTERS = new Interface(["function trackingToken() view returns (address)", "function poolRewards() view returns (address)"]);
const CHUNK_SIZE = 100; // getters per tryAggregate eth_call, keeps each call far below RPC gas caps

const TO_TREASURY = `${METRIC.PROTOCOL_FEES} To Treasury`;
const TO_HOLDERS = `${METRIC.PROTOCOL_FEES} To vlPEAS Holders`;

// Reads an address getter on each target, null where the target reverts or does not return one address (EOAs,
// unrelated contracts). A permitFailure multicall returns null for an RPC failure as well, which would silently
// drop TokenRewards senders, so this calls tryAggregate(false) directly: per-call reverts come back as
// success = false, while an RPC failure throws and the window is retried.
async function readAddresses(options: FetchOptions, getter: "trackingToken" | "poolRewards", targets: string[]) {
  const callData = GETTERS.encodeFunctionData(getter);
  const addresses: (string | null)[] = [];
  for (let i = 0; i < targets.length; i += CHUNK_SIZE) {
    const chunk = targets.slice(i, i + CHUNK_SIZE);
    const results = await options.api.call({ target: MULTICALL3, abi: TRY_AGGREGATE, params: [false, chunk.map((target) => [target, callData])] });
    if (!Array.isArray(results) || results.length !== chunk.length) throw new Error(`peapods: unexpected tryAggregate response for ${getter}`);
    results.forEach(([success, returnData]: [boolean, string]) => {
      const match = success && /^0x0{24}([0-9a-fA-F]{40})$/.exec(returnData); // exactly one ABI-encoded address
      addresses.push(match ? `0x${match[1].toLowerCase()}` : null);
    });
  }
  return addresses;
}

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
  const trackingTokens = await readAddresses(options, "trackingToken", senders);
  const candidates = senders
    .map((sender, i) => ({ sender, trackingToken: trackingTokens[i] }))
    .filter(({ trackingToken }) => trackingToken && trackingToken !== ADDRESSES.null);
  const poolRewards = await readAddresses(options, "poolRewards", candidates.map(({ trackingToken }) => trackingToken!));
  const tokenRewards = new Set(candidates.filter(({ sender }, i) => poolRewards[i] === sender).map(({ sender }) => sender));

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
