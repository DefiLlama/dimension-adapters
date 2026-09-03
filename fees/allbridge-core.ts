import { CHAIN } from "../helpers/chains";
import { FetchOptions, SimpleAdapter } from "../adapters/types";

/*
Allbridge Core (https://core.allbridge.io) is a stablecoin bridge built on burn-and-mint transfer
protocols (Circle CCTP v1/v2, LayerZero OFT, Circle xReserve). Nothing is locked in Allbridge contracts.

Users pay two kinds of fees on the source chain, both emitted by the Allbridge bridge contracts:
  - bridge fee: a share (bps) of the transferred stablecoin kept by Allbridge (adminFeeTokenAmount);
  - relayer fee: covers delivery on the destination chain, paid either in native gas (msg.value,
    receivedRelayerFeeFromGas) or deducted from the stablecoin (receivedRelayerFeeTokenAmount).
Fees charged by the underlying transfer protocols themselves (e.g. Circle's fast-transfer fee) are not counted.
Contracts: https://github.com/allbridge-io/allbridge-core-evm-contracts
Addresses: https://api.core.allbridge.io/token-info
*/

const BRIDGE_FEES = "Bridge Fees";
const RELAYER_FEES = "Relayer Fees";

const EVENT_CCTP_V1_TOKENS_SENT =
  "event TokensSent(uint256 amount, address sender, bytes32 recipient, uint256 destinationChainId, uint256 nonce, uint256 receivedRelayerFeeFromGas, uint256 receivedRelayerFeeFromTokens, uint256 relayerFee, uint256 receivedRelayerFeeTokenAmount, uint256 adminFeeTokenAmount)";
const EVENT_CCTP_V2_TOKENS_SENT =
  "event TokensSent(address sender, bytes32 recipient, uint256 amount, uint256 destinationChainId, uint256 receivedRelayerFeeFromGas, uint256 receivedRelayerFeeFromTokens, uint256 relayerFee, uint256 receivedRelayerFeeTokenAmount, uint256 adminFeeTokenAmount, uint256 maxFee)";
const EVENT_OFT_TOKENS_SENT =
  "event OftTokensSent(address sender, bytes32 recipient, address tokenAddress, uint256 amount, uint256 destinationChainId, uint256 receivedRelayerFeeFromGas, uint256 receivedRelayerFeeFromTokens, uint256 relayerFeeWithExtraGas, uint256 receivedRelayerFeeTokenAmount, uint256 adminFeeTokenAmount, uint256 extraGasDestinationToken)";
const EVENT_XRESERVE_TOKENS_SENT =
  "event XReserveTokensSent(address sender, bytes32 recipient, uint256 amount, uint256 destinationChainId, uint256 adminFeeTokenAmount, uint256 maxFee)";

type TokenBridge = { bridge: string; token: string };
type ChainConfig = {
  start: string;
  cctpV1?: TokenBridge;
  cctpV2?: TokenBridge;
  oft?: { bridge: string };
  xReserve?: TokenBridge;
};

const chainConfig: Record<string, ChainConfig> = {
  [CHAIN.ETHEREUM]: {
    start: "2024-03-25", // CctpBridge (v1) deployed at block 19512388; CctpV2Bridge 2025-04-14, OftBridge 2025-07-07, XReserveBridge 2026-04-08
    cctpV1: { bridge: "0xC51397b75B783E31469bFaADE79913F3f82210d6", token: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" },
    cctpV2: { bridge: "0x7972d6907739593C00e6284c53C83dB3ECd15c33", token: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" },
    oft: { bridge: "0xeC455fFC19811e573eb5700a1bDff6ee1C47AB7B" },
    xReserve: { bridge: "0x44F9E60cB5543777492101BF424271c5F252cF15", token: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" },
  },
  [CHAIN.ARBITRUM]: {
    start: "2024-03-25", // CctpBridge (v1) deployed at block 194098736; CctpV2Bridge 2025-05-02, OftBridge 2025-07-07
    cctpV1: { bridge: "0x23e1aEC13c92158643cF2aA17E155D27A792ccdb", token: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831" },
    cctpV2: { bridge: "0x7ED5343dFC95dc3eBe5B6de64F5B5423A888Ca18", token: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831" },
    oft: { bridge: "0xB074e73e637E778BE6411c3732bD58D44194FDEa" },
  },
  [CHAIN.AVAX]: {
    start: "2024-03-25", // CctpBridge (v1) deployed at block 43359916; CctpV2Bridge 2025-04-14
    cctpV1: { bridge: "0x65dE05Fccce36Ce7FdDd668Ef4348D9e933B57Ff", token: "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E" },
    cctpV2: { bridge: "0x5FBf8d23fa705A0bADb6f398fDcdC28FCCB521c0", token: "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E" },
  },
  [CHAIN.BASE]: {
    start: "2024-03-25", // CctpBridge (v1) deployed at block 12295119; CctpV2Bridge deployed at block 28919906 (2025-04-14)
    cctpV1: { bridge: "0x1eFE2C85989D97fEBbD0743cdd79B9F0826314f6", token: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" },
    cctpV2: { bridge: "0x214D972b8c869cfcE50D55B595adC7eF336D7FAd", token: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" },
  },
  [CHAIN.POLYGON]: {
    start: "2024-03-25", // CctpBridge (v1) deployed at block 55066880
    cctpV1: { bridge: "0x710282BfeB554Ed0A34dFaD061C7c343221AC82C", token: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359" },
  },
  [CHAIN.OPTIMISM]: {
    start: "2024-03-25", // CctpBridge (v1) deployed at block 117890737
    cctpV1: { bridge: "0x08391edF36f41f05d27A1e0fD7a29448417C1CD0", token: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85" },
  },
  [CHAIN.UNICHAIN]: {
    start: "2025-09-04", // OftBridge deployed at block 26240639
    oft: { bridge: "0xe8A580782942e072C57bcf7db8329C7a7CC0528B" },
  },
  [CHAIN.TRON]: {
    start: "2025-07-07", // OftBridge deployed 2025-07-07 (tronscan)
    oft: { bridge: "0xe012a88a7555bba9b69c9dd44a04b5f88937fd35" }, // TWPziSAroSacAjDuL52ByQzU86s9mP2gPr
  },
};

const fetch = async (options: FetchOptions) => {
  const { cctpV1, cctpV2, oft, xReserve } = chainConfig[options.chain];
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();

  const addStablecoinBridgeFees = (token: string, log: any) => {
    dailyFees.add(token, log.adminFeeTokenAmount, BRIDGE_FEES);
    dailyRevenue.add(token, log.adminFeeTokenAmount, BRIDGE_FEES);
    dailyFees.add(token, log.receivedRelayerFeeTokenAmount, RELAYER_FEES);
    dailyFees.addGasToken(log.receivedRelayerFeeFromGas, RELAYER_FEES);
  };

  if (cctpV1) {
    const logs = await options.getLogs({ target: cctpV1.bridge, eventAbi: EVENT_CCTP_V1_TOKENS_SENT });
    logs.forEach((log: any) => addStablecoinBridgeFees(cctpV1.token, log));
  }

  if (cctpV2) {
    const logs = await options.getLogs({ target: cctpV2.bridge, eventAbi: EVENT_CCTP_V2_TOKENS_SENT });
    logs.forEach((log: any) => addStablecoinBridgeFees(cctpV2.token, log));
  }

  if (oft) {
    const logs = await options.getLogs({ target: oft.bridge, eventAbi: EVENT_OFT_TOKENS_SENT });
    logs.forEach((log: any) => addStablecoinBridgeFees(log.tokenAddress, log));
  }

  if (xReserve) {
    const logs = await options.getLogs({ target: xReserve.bridge, eventAbi: EVENT_XRESERVE_TOKENS_SENT });
    logs.forEach((log: any) => {
      dailyFees.add(xReserve.token, log.adminFeeTokenAmount, BRIDGE_FEES);
      dailyRevenue.add(xReserve.token, log.adminFeeTokenAmount, BRIDGE_FEES);
    });
  }

  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
  };
};

const methodology = {
  Fees: "Bridge fees (a share of the transferred stablecoin) plus relayer fees (paid in native gas or deducted from the stablecoin) charged on the source chain of every Allbridge Core transfer.",
  UserFees: "All fees are paid by the users sending transfers.",
  Revenue: "Bridge fees kept by Allbridge. Relayer fees are spent on delivering the transfer on the destination chain and are not counted as revenue.",
  ProtocolRevenue: "All revenue goes to the protocol.",
};

const breakdownMethodology = {
  Fees: {
    [BRIDGE_FEES]: "Share of the transferred stablecoin kept by Allbridge, emitted as adminFeeTokenAmount.",
    [RELAYER_FEES]: "Relayer fee covering delivery on the destination chain, paid in native gas (receivedRelayerFeeFromGas) or in the stablecoin (receivedRelayerFeeTokenAmount).",
  },
  Revenue: {
    [BRIDGE_FEES]: "Share of the transferred stablecoin kept by Allbridge.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  adapter: chainConfig,
  methodology,
  breakdownMethodology,
};

export default adapter;
