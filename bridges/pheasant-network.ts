import ADDRESSES from "../helpers/coreAssets.json";
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

// Pheasant Network bridge: a user deposit emits NewTrade on the source chain's bridge contract (outgoing), and the
// destination payout emits Filled on that chain's ERC-7683 payout executor (incoming, after fees; the source Withdraw
// only reimburses the relayer). Addresses from the bridges-server adapter; payout executors from params.payoutExecutor(networkCode).
// Pheasant CCTP: the user's USDC is burned through Circle's TokenMessenger v1 by PheasantNetworkCctpBurn, which emits
// DepositForBurnCalled with the amount after Pheasant's fee (outgoing). Pheasant's relayer then calls receiveMessage on
// Circle's MessageTransmitter v1 on the destination chain, which emits MessageReceived; burn messages whose
// messageSender is a Pheasant burn contract are counted as incoming, amount from the BurnMessage body. Two generations
// of burn contracts exist: 2024-10 (6-arg event) and the 2025-05 proxies (7-arg event with originalAmount).
// This USDC is also counted by the `circle` listing.
// Not counted: PheasantSwap (SwapNewTrade, tokens handed to third-party aggregators), listed under aggregators and
// bridge-aggregators instead.
const NEW_TRADE = "event NewTrade(address indexed userAddress, uint256 index, address to, uint256 amount, address token)";
const FILLED = "event Filled(bytes32 indexed orderId, bytes32 indexed orderTermsHash, address indexed recipient, address token, uint256 amount, address filler)";
const DEPOSIT_FOR_BURN_CALLED_V1 =
  "event DepositForBurnCalled(address indexed sender, bytes32 indexed recipient, uint32 indexed destinationDomain, uint256 index, uint256 amount, address token)";
const DEPOSIT_FOR_BURN_CALLED_V2 =
  "event DepositForBurnCalled(address indexed sender, bytes32 indexed recipient, uint32 indexed destinationDomain, uint256 index, uint256 amount, address token, uint256 originalAmount)";
const MESSAGE_RECEIVED =
  "event MessageReceived(address indexed caller, uint32 sourceDomain, uint64 indexed nonce, bytes32 sender, bytes messageBody)";

type ChainConfig = {
  bridge?: string;
  payoutExecutor?: string;
  cctp?: { burnV1?: string[]; burnV2?: string; messageTransmitter: string; usdc: string };
};

const chainConfig: Record<string, ChainConfig> = {
  [CHAIN.ETHEREUM]: {
    bridge: "0x20A41749545eB0C6266838257aDeA7b86d5369Ac",
    payoutExecutor: "0xb56De9d9Fb52f7Ef86407DC669868D24b61714A0",
    cctp: {
      burnV1: ["0x847885c4a883A42dbC58c9f318df3106306c2467"],
      burnV2: "0x2dC80114D923dA07327b7096226359D785F32e3F",
      messageTransmitter: "0x0a992d191DEeC32aFe36203Ad87D7d289a738F81",
      usdc: ADDRESSES.ethereum.USDC,
    },
  },
  [CHAIN.OPTIMISM]: {
    bridge: "0x0C4F10259c8b5Ed7238B76A0a6EfEf82cd2908Bf",
    payoutExecutor: "0x3ADf0Ae154c6FAd0aEf6bCdf8a7198Ebea37AD60",
    cctp: {
      burnV1: ["0x9dD4a939D6646028d3a35Eb45737f18Ee047D480"],
      burnV2: "0xe8105d442EaD594fb05D6bE20d9813c8b7b974bD",
      messageTransmitter: "0x4D41f22c5a0e5c74090899E5a8Fb597a8842b3e8",
      usdc: ADDRESSES.optimism.USDC_CIRCLE,
    },
  },
  [CHAIN.ARBITRUM]: {
    bridge: "0x97450C9B5fC6D1b86bF87EFDCbB137f26F8b497e",
    payoutExecutor: "0xD0d9df958bB728B0C90E7c94Aa398C26D2e4a3C5",
    cctp: {
      burnV1: ["0xF25B5E622fB6dBab216671b282F89f51Cd10D009", "0x268d153690F07E46dFbfC57cB74d5fb6BF5994fA"],
      burnV2: "0xBc0E277204f85d3924577FF2b0E50e67051B3E62",
      messageTransmitter: "0xC30362313FBBA5cf9163F0bb16a0e01f01A896ca",
      usdc: ADDRESSES.arbitrum.USDC_CIRCLE,
    },
  },
  [CHAIN.SCROLL]: { bridge: "0xcAebc3309bFe45313922BFBa1a36C4458937E2A2", payoutExecutor: "0xd24E559A023729e95863d0Afc4B99Ff01969d8E3" },
  [CHAIN.BASE]: {
    bridge: "0x8A7Ee008B18DF025bc778B034Dbd7ad507221e10",
    payoutExecutor: "0x25cf6B24eC351d1695490B2046310cA3e8AdBE7B",
    cctp: {
      burnV1: ["0xA3ed5F8D0Df3C1225E084ce6879DFBFE91Ae567d"],
      burnV2: "0xE33Bf689B53ae461bd253617B60408227182362b",
      messageTransmitter: "0xAD09780d193884d503182aD4588450C416D6F9D4",
      usdc: ADDRESSES.base.USDC,
    },
  },
  [CHAIN.LINEA]: { bridge: "0xbe7F97E4B54747B75B8aaF84ecafE876BaCA9198", payoutExecutor: "0x4393Cd250B2EC2cF7d3391c79de902207b246539" },
  [CHAIN.TAIKO]: { bridge: "0x7a651Ef5A53B128d406c9093feA2650e8A6156b5", payoutExecutor: "0xaae93A258792cFa4734e3fE897910fB0A90fE01d" },
  [CHAIN.MORPH]: { bridge: "0x56DE23ed536b2Bf8D398F2E1703Ce9aDb48B09F4", payoutExecutor: "0x52bC80E50FE8C8C4Fa131E7169eF9B64dA905685" },
  [CHAIN.ERA]: { bridge: "0xaFDaD3F10c7c906434422F229bCfB120bcE51C6c", payoutExecutor: "0x7120a850cD4FAd691147164D2eD8F2DEDb77Cc60" },
  [CHAIN.UNICHAIN]: {
    bridge: "0x81505846153403EBd6Cf5e89dD9f3eF2277fe374",
    payoutExecutor: "0x5c2E7369f044Ae87e40B19582056ede717953337",
    cctp: {
      burnV2: "0x9476A404191a52aD48C0F486584fA8FdAD6f5cae",
      messageTransmitter: "0x353bE9E2E38AB1D19104534e4edC21c643Df86f4",
      usdc: ADDRESSES.unichain.USDC,
    },
  },
  [CHAIN.MEGAETH]: { bridge: "0x554590DC69830507248Ebc7AD3Bc9d6fA94488d2", payoutExecutor: "0x89E31B12e5fD6961474F7d814F90a5a0fDD7d55A" },
};

const pheasantBurnContracts = new Set(
  Object.values(chainConfig)
    .flatMap(({ cctp }) => [...(cctp?.burnV1 ?? []), ...(cctp?.burnV2 ? [cctp.burnV2] : [])])
    .map((a) => a.toLowerCase())
);

// Circle BurnMessage body: version (4 bytes) | burnToken (32) | mintRecipient (32) | amount (32) | messageSender (32)
const parseBurnMessage = (body: string) => {
  const hex = body.startsWith("0x") ? body.slice(2) : body;
  if (hex.length < 264) return null;
  return {
    version: parseInt(hex.slice(0, 8), 16),
    amount: BigInt("0x" + hex.slice(136, 200)),
    messageSender: "0x" + hex.slice(224, 264),
  };
};

const fetch = async (options: FetchOptions) => {
  const { bridge, payoutExecutor, cctp } = chainConfig[options.chain];
  const dailyOutgoingVolume = options.createBalances();
  const dailyIncomingVolume = options.createBalances();
  let dailyOutgoingTxCount = 0;
  let dailyIncomingTxCount = 0;

  if (bridge && payoutExecutor) {
    const trades = await options.getLogs({ target: bridge, eventAbi: NEW_TRADE });
    const fills = await options.getLogs({ target: payoutExecutor, eventAbi: FILLED });
    for (const l of trades) dailyOutgoingVolume.add(l.token, l.amount);
    for (const l of fills) dailyIncomingVolume.add(l.token, l.amount);
    dailyOutgoingTxCount += trades.length;
    dailyIncomingTxCount += fills.length;
  }

  if (cctp) {
    const { burnV1, burnV2, messageTransmitter, usdc } = cctp;
    const burns = [
      ...(burnV1 ? await options.getLogs({ targets: burnV1, eventAbi: DEPOSIT_FOR_BURN_CALLED_V1 }) : []),
      ...(burnV2 ? await options.getLogs({ target: burnV2, eventAbi: DEPOSIT_FOR_BURN_CALLED_V2 }) : []),
    ];
    for (const l of burns) dailyOutgoingVolume.add(l.token, l.amount);
    dailyOutgoingTxCount += burns.length;

    const received = await options.getLogs({ target: messageTransmitter, eventAbi: MESSAGE_RECEIVED });
    for (const l of received) {
      const message = parseBurnMessage(l.messageBody);
      if (!message || message.version !== 0 || !pheasantBurnContracts.has(message.messageSender)) continue;
      dailyIncomingVolume.add(usdc, message.amount);
      dailyIncomingTxCount++;
    }
  }

  return { dailyOutgoingVolume, dailyIncomingVolume, dailyOutgoingTxCount, dailyIncomingTxCount };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  adapter: Object.fromEntries(Object.keys(chainConfig).map((chain) => [chain, {}])),
  methodology: {
    OutgoingVolume:
      "Value of tokens users deposit into Pheasant Network's bridge on each chain, plus USDC burned through Pheasant's CCTP wrapper after fees.",
    IncomingVolume:
      "Value of tokens paid out to users on each chain when their Pheasant Network transfer is filled, after fees, plus USDC minted on each chain for Pheasant CCTP transfers.",
    OutgoingTxCount: "Number of Pheasant Network deposits and CCTP burns on each chain.",
    IncomingTxCount: "Number of Pheasant Network payouts and CCTP mints on each chain.",
  },
};

export default adapter;
