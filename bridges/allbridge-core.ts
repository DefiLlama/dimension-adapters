import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryAllium } from "../helpers/allium";
import { evmToTronAddress, tronToEvmAddress } from "@defillama/sdk/build/generalUtil";
import { ethers } from "ethers";

// Allbridge Core routes stablecoins over Circle CCTP (v1, v2), LayerZero OFT and Circle xReserve; nothing is locked in its contracts.
// Outgoing: the send events of Allbridge's bridge contracts on the source chain.
// Incoming: only CCTP v2, where Allbridge's contract triggers the mint: its ReceivedMessageId is matched by transaction hash to
// Circle's MintAndWithdraw, which carries the minted token and amount. CCTP v1, OFT and xReserve deliveries are made by
// Circle / LayerZero directly to the recipient and are not attributable to Allbridge on the destination chain.
// Tron OFT sends come from Allium's raw logs.
// https://api.core.allbridge.io/token-info
// Before this date Allbridge Core ran liquidity pools, and the old bridges server tracked their transfers instead (history migrated
// from it); the pools were wound down and it switched to these bridge contracts on 2026-09-07 (bridges-server #506).
const POOLS_WOUND_DOWN = "2026-09-07";

type Contracts = {
  cctpV1?: { bridge: string; token: string };
  cctpV2?: { bridge: string; token: string };
  oft?: string;
  xReserve?: { bridge: string; token: string };
  start: string;
};
const chainConfig: Record<string, Contracts> = {
  [CHAIN.ETHEREUM]: {
    cctpV1: { bridge: "0xC51397b75B783E31469bFaADE79913F3f82210d6", token: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" },
    cctpV2: { bridge: "0x7972d6907739593C00e6284c53C83dB3ECd15c33", token: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" },
    oft: "0xeC455fFC19811e573eb5700a1bDff6ee1C47AB7B",
    xReserve: { bridge: "0x44F9E60cB5543777492101BF424271c5F252cF15", token: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" },
    start: POOLS_WOUND_DOWN,
  },
  [CHAIN.ARBITRUM]: {
    cctpV1: { bridge: "0x23e1aEC13c92158643cF2aA17E155D27A792ccdb", token: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831" },
    cctpV2: { bridge: "0x7ED5343dFC95dc3eBe5B6de64F5B5423A888Ca18", token: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831" },
    oft: "0xB074e73e637E778BE6411c3732bD58D44194FDEa",
    start: POOLS_WOUND_DOWN,
  },
  [CHAIN.AVAX]: {
    cctpV1: { bridge: "0x65dE05Fccce36Ce7FdDd668Ef4348D9e933B57Ff", token: "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E" },
    cctpV2: { bridge: "0x5FBf8d23fa705A0bADb6f398fDcdC28FCCB521c0", token: "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E" },
    start: POOLS_WOUND_DOWN,
  },
  [CHAIN.BASE]: {
    cctpV1: { bridge: "0x1eFE2C85989D97fEBbD0743cdd79B9F0826314f6", token: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" },
    cctpV2: { bridge: "0x214D972b8c869cfcE50D55B595adC7eF336D7FAd", token: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" },
    start: POOLS_WOUND_DOWN,
  },
  [CHAIN.POLYGON]: { cctpV1: { bridge: "0x710282BfeB554Ed0A34dFaD061C7c343221AC82C", token: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359" }, start: POOLS_WOUND_DOWN },
  [CHAIN.OPTIMISM]: { cctpV1: { bridge: "0x08391edF36f41f05d27A1e0fD7a29448417C1CD0", token: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85" }, start: POOLS_WOUND_DOWN },
  [CHAIN.UNICHAIN]: { oft: "0xe8A580782942e072C57bcf7db8329C7a7CC0528B", start: POOLS_WOUND_DOWN },
};
const TRON_OFT_BRIDGE = "TWPziSAroSacAjDuL52ByQzU86s9mP2gPr";
const TRON_START = POOLS_WOUND_DOWN;
const CCTP_V2_TOKEN_MESSENGER = "0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d";

const CCTP_V1_SENT = "event TokensSent(uint256 amount, address sender, bytes32 recipient, uint256 destinationChainId, uint256 nonce, uint256 receivedRelayerFeeFromGas, uint256 receivedRelayerFeeFromTokens, uint256 relayerFee, uint256 receivedRelayerFeeTokenAmount, uint256 adminFeeTokenAmount)";
const CCTP_V2_SENT = "event TokensSent(address sender, bytes32 recipient, uint256 amount, uint256 destinationChainId, uint256 receivedRelayerFeeFromGas, uint256 receivedRelayerFeeFromTokens, uint256 relayerFee, uint256 receivedRelayerFeeTokenAmount, uint256 adminFeeTokenAmount, uint256 maxFee)";
const OFT_SENT = "event OftTokensSent(address sender, bytes32 recipient, address tokenAddress, uint256 amount, uint256 destinationChainId, uint256 receivedRelayerFeeFromGas, uint256 receivedRelayerFeeFromTokens, uint256 relayerFeeWithExtraGas, uint256 receivedRelayerFeeTokenAmount, uint256 adminFeeTokenAmount, uint256 extraGasDestinationToken)";
const XRESERVE_SENT = "event XReserveTokensSent(address sender, bytes32 recipient, uint256 amount, uint256 destinationChainId, uint256 adminFeeTokenAmount, uint256 maxFee)";

const fetchEvm = async (options: FetchOptions) => {
  const { cctpV1, cctpV2, oft, xReserve } = chainConfig[options.chain];
  const dailyOutgoingVolume = options.createBalances();
  const dailyIncomingVolume = options.createBalances();
  let dailyOutgoingTxCount = 0;
  let dailyIncomingTxCount = 0;

  // sends with a fixed token (CCTP and xReserve move USDC)
  for (const route of [{ c: cctpV1, eventAbi: CCTP_V1_SENT }, { c: cctpV2, eventAbi: CCTP_V2_SENT }, { c: xReserve, eventAbi: XRESERVE_SENT }]) {
    if (!route.c) continue;
    const sends = await options.getLogs({ target: route.c.bridge, eventAbi: route.eventAbi });
    for (const { amount } of sends) dailyOutgoingVolume.add(route.c.token, amount);
    dailyOutgoingTxCount += sends.length;
  }
  if (oft) {
    const sends = await options.getLogs({ target: oft, eventAbi: OFT_SENT });
    for (const { tokenAddress, amount } of sends) dailyOutgoingVolume.add(tokenAddress, amount);
    dailyOutgoingTxCount += sends.length;
  }

  // CCTP v2 receipts: Circle mints made in the same transaction as Allbridge's ReceivedMessageId
  if (cctpV2) {
    const received = await options.getLogs({ target: cctpV2.bridge, eventAbi: "event ReceivedMessageId(bytes32 messageId)", entireLog: true, parseLog: true });
    const allbridgeTxs = new Set(received.map((log: any) => log.transactionHash));
    const mints = await options.getLogs({ target: CCTP_V2_TOKEN_MESSENGER, eventAbi: "event MintAndWithdraw(address indexed mintRecipient, uint256 amount, address indexed mintToken, uint256 feeCollected)", entireLog: true, parseLog: true });
    for (const mint of mints) {
      if (!allbridgeTxs.has(mint.transactionHash)) continue;
      dailyIncomingVolume.add(mint.args.mintToken, mint.args.amount);
      dailyIncomingTxCount++;
    }
  }

  return { dailyOutgoingVolume, dailyIncomingVolume, dailyOutgoingTxCount, dailyIncomingTxCount };
};

const fetchTron = async (options: FetchOptions) => {
  const dailyOutgoingVolume = options.createBalances();
  const iface = new ethers.Interface([OFT_SENT]);
  const topic0 = iface.getEvent("OftTokensSent")!.topicHash;
  const rows: { data: string }[] = await queryAllium(`
    select data
    from tron.raw.logs
    where block_timestamp >= TO_TIMESTAMP_NTZ(${options.startTimestamp})
      and block_timestamp < TO_TIMESTAMP_NTZ(${options.endTimestamp})
      and lower(address_evm) = '${tronToEvmAddress(TRON_OFT_BRIDGE).toLowerCase()}'
      and topic0 = '${topic0}'
  `);
  for (const row of rows) {
    const { args } = iface.parseLog({ topics: [topic0], data: row.data })!;
    // tron prices are keyed by base58 token addresses
    dailyOutgoingVolume.add(evmToTronAddress(args.tokenAddress), args.amount);
  }
  return { dailyOutgoingVolume, dailyIncomingVolume: options.createBalances(), dailyOutgoingTxCount: rows.length, dailyIncomingTxCount: 0 };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch: (options: FetchOptions) => (options.chain === CHAIN.TRON ? fetchTron(options) : fetchEvm(options)),
  adapter: {
    ...Object.fromEntries(Object.entries(chainConfig).map(([chain, { start }]) => [chain, { start }])),
    [CHAIN.TRON]: { start: TRON_START },
  },
  dependencies: [Dependencies.ALLIUM],
  methodology: {
    OutgoingVolume: "Value of stablecoins sent through Allbridge Core's CCTP, OFT and xReserve bridge contracts on each chain.",
    IncomingVolume: "Value of USDC minted to recipients through Allbridge Core's CCTP v2 route on each chain; other routes deliver directly from Circle or LayerZero and are only counted on the source chain.",
    OutgoingTxCount: "Number of Allbridge Core transfers sent from each chain.",
    IncomingTxCount: "Number of Allbridge Core CCTP v2 transfers received on each chain.",
  },
};

export default adapter;
