import ADDRESSES from "../helpers/coreAssets.json";
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

// Pheasant Network CCTP (USDC Bridge): the user's USDC is burned through Circle's TokenMessenger v1 by PheasantNetworkCctpBurn,
// which emits DepositForBurnCalled with the amount after Pheasant's fee (outgoing). Pheasant's relayer then calls
// receiveMessage on Circle's MessageTransmitter v1 on the destination chain, which emits MessageReceived. A received
// message counts as incoming when its sender is Circle's TokenMessenger v1 of its sourceDomain (addresses and domain ids
// from https://developers.circle.com/cctp/v1/evm-smart-contracts) and its BurnMessage body names a Pheasant burn contract
// as messageSender; the amount comes from the body. Two generations of burn contracts exist: 2024-10 (6-arg event) and
// the 2025-05 proxies (7-arg event with originalAmount).
// Doublecounted: the same USDC moves through Circle CCTP and is counted by the `circle` listing.
// The Pheasant Network bridge itself (NewTrade / Filled) is bridges/pheasant-network.
// Pheasant addresses: the 2025-05 proxies (burnV2) are the "CCTP Contract" column of
// https://docs.pheasant.network/products/bridge/network-code-and-address; the 2024-10 contracts (burnV1) are the previous
// PheasantNetworkCctpBurn entries of the published SDK registry (@pheasant-network/pheasant-sdk,
// dist/address/contractAddresses.prod.json), explorer links next to each one.
const DEPOSIT_FOR_BURN_CALLED_V1 =
  "event DepositForBurnCalled(address indexed sender, bytes32 indexed recipient, uint32 indexed destinationDomain, uint256 index, uint256 amount, address token)";
const DEPOSIT_FOR_BURN_CALLED_V2 =
  "event DepositForBurnCalled(address indexed sender, bytes32 indexed recipient, uint32 indexed destinationDomain, uint256 index, uint256 amount, address token, uint256 originalAmount)";
const MESSAGE_RECEIVED =
  "event MessageReceived(address indexed caller, uint32 sourceDomain, uint64 indexed nonce, bytes32 sender, bytes messageBody)";

type ChainConfig = {
  domain: number; // Circle CCTP domain id
  tokenMessenger: string; // Circle TokenMessenger v1
  messageTransmitter: string; // Circle MessageTransmitter v1
  burnV1?: string[]; // PheasantNetworkCctpBurn, 2024-10 generation (SDK registry, see header)
  burnV2?: string; // PheasantNetworkCctpBurn proxy, 2025-05 generation (docs "CCTP Contract" column, see header)
  usdc: string;
  start: string; // first burn contract deployment (Ethereum, Optimism, Base 2024-10-14; Arbitrum 2024-10-11; Unichain 2025-08-08)
};

const chainConfig: Record<string, ChainConfig> = {
  [CHAIN.ETHEREUM]: {
    domain: 0,
    tokenMessenger: "0xBd3fa81B58Ba92a82136038B25aDec7066af3155",
    messageTransmitter: "0x0a992d191DEeC32aFe36203Ad87D7d289a738F81",
    burnV1: ["0x847885c4a883A42dbC58c9f318df3106306c2467"], // https://etherscan.io/address/0x847885c4a883A42dbC58c9f318df3106306c2467
    burnV2: "0x2dC80114D923dA07327b7096226359D785F32e3F",
    usdc: ADDRESSES.ethereum.USDC,
    start: "2024-10-14",
  },
  [CHAIN.OPTIMISM]: {
    domain: 2,
    tokenMessenger: "0x2B4069517957735bE00ceE0fadAE88a26365528f",
    messageTransmitter: "0x4D41f22c5a0e5c74090899E5a8Fb597a8842b3e8",
    burnV1: ["0x9dD4a939D6646028d3a35Eb45737f18Ee047D480"], // https://optimistic.etherscan.io/address/0x9dD4a939D6646028d3a35Eb45737f18Ee047D480
    burnV2: "0xe8105d442EaD594fb05D6bE20d9813c8b7b974bD",
    usdc: ADDRESSES.optimism.USDC_CIRCLE,
    start: "2024-10-14",
  },
  [CHAIN.ARBITRUM]: {
    domain: 3,
    tokenMessenger: "0x19330d10D9Cc8751218eaf51E8885D058642E08A",
    messageTransmitter: "0xC30362313FBBA5cf9163F0bb16a0e01f01A896ca",
    burnV1: [
      "0xF25B5E622fB6dBab216671b282F89f51Cd10D009", // https://arbiscan.io/address/0xF25B5E622fB6dBab216671b282F89f51Cd10D009
      "0x268d153690F07E46dFbfC57cB74d5fb6BF5994fA", // https://arbiscan.io/address/0x268d153690F07E46dFbfC57cB74d5fb6BF5994fA
    ],
    burnV2: "0xBc0E277204f85d3924577FF2b0E50e67051B3E62",
    usdc: ADDRESSES.arbitrum.USDC_CIRCLE,
    start: "2024-10-11",
  },
  [CHAIN.BASE]: {
    domain: 6,
    tokenMessenger: "0x1682Ae6375C4E4A97e4B583BC394c861A46D8962",
    messageTransmitter: "0xAD09780d193884d503182aD4588450C416D6F9D4",
    burnV1: ["0xA3ed5F8D0Df3C1225E084ce6879DFBFE91Ae567d"], // https://basescan.org/address/0xA3ed5F8D0Df3C1225E084ce6879DFBFE91Ae567d
    burnV2: "0xE33Bf689B53ae461bd253617B60408227182362b",
    usdc: ADDRESSES.base.USDC,
    start: "2024-10-14",
  },
  [CHAIN.UNICHAIN]: {
    domain: 10,
    tokenMessenger: "0x4e744b28E787c3aD0e810eD65A24461D4ac5a762",
    messageTransmitter: "0x353bE9E2E38AB1D19104534e4edC21c643Df86f4",
    burnV2: "0x9476A404191a52aD48C0F486584fA8FdAD6f5cae",
    usdc: ADDRESSES.unichain.USDC,
    start: "2025-08-08",
  },
};

const pheasantBurnContracts = new Set(
  Object.values(chainConfig)
    .flatMap(({ burnV1, burnV2 }) => [...(burnV1 ?? []), ...(burnV2 ? [burnV2] : [])])
    .map((a) => a.toLowerCase())
);

// Circle TokenMessenger v1 by CCTP domain: MessageReceived.sender must be the TokenMessenger of MessageReceived.sourceDomain
const tokenMessengerByDomain = new Map(
  Object.values(chainConfig).map(({ domain, tokenMessenger }) => [domain, tokenMessenger.toLowerCase()])
);

// bytes32 left-padded address -> 0x + 40 hex chars
const bytes32ToAddress = (b: string) => "0x" + b.slice(-40).toLowerCase();

// Circle BurnMessage body: version (4 bytes) | burnToken (32) | mintRecipient (32) | amount (32) | messageSender (32)
// Layout from https://github.com/circlefin/evm-cctp-contracts/blob/master/src/messages/BurnMessage.sol
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
  const { burnV1, burnV2, messageTransmitter, usdc } = chainConfig[options.chain];
  const dailyOutgoingVolume = options.createBalances();
  const dailyIncomingVolume = options.createBalances();

  const burns = [
    ...(burnV1 ? await options.getLogs({ targets: burnV1, eventAbi: DEPOSIT_FOR_BURN_CALLED_V1 }) : []),
    ...(burnV2 ? await options.getLogs({ target: burnV2, eventAbi: DEPOSIT_FOR_BURN_CALLED_V2 }) : []),
  ];
  for (const l of burns) dailyOutgoingVolume.add(l.token, l.amount);

  let dailyIncomingTxCount = 0;
  const received = await options.getLogs({ target: messageTransmitter, eventAbi: MESSAGE_RECEIVED });
  for (const l of received) {
    if (tokenMessengerByDomain.get(Number(l.sourceDomain)) !== bytes32ToAddress(l.sender)) continue;
    const message = parseBurnMessage(l.messageBody);
    if (!message || message.version !== 0 || !pheasantBurnContracts.has(message.messageSender)) continue;
    dailyIncomingVolume.add(usdc, message.amount);
    dailyIncomingTxCount++;
  }

  return { dailyOutgoingVolume, dailyIncomingVolume, dailyOutgoingTxCount: burns.length, dailyIncomingTxCount };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  doublecounted: true, // the USDC moves through Circle CCTP and is also counted by the circle listing
  fetch,
  adapter: chainConfig,
  methodology: {
    OutgoingVolume: "USDC burned on each chain through Pheasant Network's CCTP wrapper, after Pheasant's fee.",
    IncomingVolume: "USDC minted on each chain by Circle's MessageTransmitter for Pheasant Network CCTP transfers.",
    OutgoingTxCount: "Number of Pheasant Network CCTP burns on each chain.",
    IncomingTxCount: "Number of Pheasant Network CCTP mints on each chain.",
  },
};

export default adapter;
