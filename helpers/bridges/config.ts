import ADDRESSES from "../coreAssets.json";
import { BridgeChainConfig, BridgeEvent } from "./index";

/**
 * Event definitions and builders for `factory/evmBridges.ts`. The factory holds addresses and chains
 * only; everything about which events a bridge emits and how to read them lives here. Interfaces
 * shared by several bridges (OP-stack, OFT, CCTP) are defined once and take addresses, bridge-specific
 * interfaces (Celer) are grouped under the bridge's name.
 */

// ---------------------------------------------------------------------------------------------------
// OP-stack L1StandardBridge, pre-Bedrock event names still emitted after Bedrock for compatibility.
// https://docs.optimism.io/chain/addresses
// ---------------------------------------------------------------------------------------------------
export const opStackEvents = (gateway: string): BridgeEvent[] => [
  { eventAbi: "event ERC20DepositInitiated(address indexed _l1Token, address indexed _l2Token, address indexed _from, address _to, uint256 _amount, bytes _data)", targets: [gateway], direction: "outgoing", tokenArg: "_l1Token", amountArg: "_amount" },
  { eventAbi: "event ETHDepositInitiated(address indexed _from, address indexed _to, uint256 _amount, bytes _data)", targets: [gateway], direction: "outgoing", fixedToken: ADDRESSES.null, amountArg: "_amount" },
  { eventAbi: "event ERC20WithdrawalFinalized(address indexed _l1Token, address indexed _l2Token, address indexed _from, address _to, uint256 _amount, bytes _data)", targets: [gateway], direction: "incoming", tokenArg: "_l1Token", amountArg: "_amount" },
  { eventAbi: "event ETHWithdrawalFinalized(address indexed _from, address indexed _to, uint256 _amount, bytes _data)", targets: [gateway], direction: "incoming", fixedToken: ADDRESSES.null, amountArg: "_amount" },
];

export const opStackBridge = (params: { gateway: string; start?: string; extraEvents?: BridgeEvent[]; escrows?: string[] }): BridgeChainConfig => ({
  start: params.start,
  events: [...opStackEvents(params.gateway), ...(params.extraEvents ?? [])],
  ...(params.escrows?.length ? { transfers: { wallets: params.escrows } } : {}),
});

// Optimism Teleportr Deposit V2, deposit-only fast bridge, inactive since 2022, kept for history
export const optimismTeleportrEvents: BridgeEvent[] = [
  { eventAbi: "event EtherReceived(uint256 indexed depositId, address indexed emitter, uint256 indexed amount)", targets: ["0x52ec2F3d7C5977A8E558C8D9C6000B615098E8fC"], direction: "outgoing", fixedToken: ADDRESSES.null, amountArg: "amount" },
];

// ---------------------------------------------------------------------------------------------------
// Celer cBridge: pool-based bridge (Send / Relay), OriginalTokenVault (Deposited / Withdrawn) and
// PeggedTokenBridge (Burn / Mint) in v1 and v2 flavours.
// https://cbridge-docs.celer.network/reference/contract-addresses
// ---------------------------------------------------------------------------------------------------
const celerPool = (targets: string[]): BridgeEvent[] => [
  { eventAbi: "event Send(bytes32 transferId, address sender, address receiver, address token, uint256 amount, uint64 dstChainId, uint64 nonce, uint32 maxSlippage)", targets, direction: "outgoing", tokenArg: "token", amountArg: "amount" },
  { eventAbi: "event Relay(bytes32 transferId, address sender, address receiver, address token, uint256 amount, uint64 srcChainId, bytes32 srcTransferId)", targets, direction: "incoming", tokenArg: "token", amountArg: "amount" },
];
// Withdrawn and Mint also fire for refunds of failed transfers and for fee claims.
// Both carry a zero burnAccount / depositor because no burn or deposit on another chain backs them
const hasCounterparty = (field: string) => (args: any) => String(args[field]).toLowerCase() !== ADDRESSES.null;
const celerVaultWithdrawn = (targets: string[]): BridgeEvent =>
  ({ eventAbi: "event Withdrawn(bytes32 withdrawId, address receiver, address token, uint256 amount, uint64 refChainId, bytes32 refId, address burnAccount)", targets, direction: "incoming", tokenArg: "token", amountArg: "amount", filter: hasCounterparty("burnAccount") });
const celerVaultV1 = (targets: string[]): BridgeEvent[] => [
  { eventAbi: "event Deposited(bytes32 depositId, address depositor, address token, uint256 amount, uint64 mintChainId, address mintAccount)", targets, direction: "outgoing", tokenArg: "token", amountArg: "amount" },
  celerVaultWithdrawn(targets),
];
const celerVaultV2 = (targets: string[]): BridgeEvent[] => [
  { eventAbi: "event Deposited(bytes32 depositId, address depositor, address token, uint256 amount, uint64 mintChainId, address mintAccount, uint64 nonce)", targets, direction: "outgoing", tokenArg: "token", amountArg: "amount" },
  celerVaultWithdrawn(targets),
];
const celerPeggedMint = (targets: string[]): BridgeEvent =>
  ({ eventAbi: "event Mint(bytes32 mintId, address token, address account, uint256 amount, uint64 refChainId, bytes32 refId, address depositor)", targets, direction: "incoming", tokenArg: "token", amountArg: "amount", filter: hasCounterparty("depositor") });
const celerPeggedV1 = (targets: string[]): BridgeEvent[] => [
  { eventAbi: "event Burn(bytes32 burnId, address token, address account, uint256 amount, address withdrawAccount)", targets, direction: "outgoing", tokenArg: "token", amountArg: "amount" },
  celerPeggedMint(targets),
];
const celerPeggedV2 = (targets: string[]): BridgeEvent[] => [
  { eventAbi: "event Burn(bytes32 burnId, address token, address account, uint256 amount, uint64 toChainId, address toAccount, uint64 nonce)", targets, direction: "outgoing", tokenArg: "token", amountArg: "amount" },
  celerPeggedMint(targets),
];

export type CelerContracts = { pool?: string[]; vaultV1?: string[]; vaultV2?: string[]; peggedV1?: string[]; peggedV2?: string[] };

export const celerBridge = (contracts: CelerContracts, start?: string): BridgeChainConfig => ({
  start,
  events: [
    ...(contracts.pool ? celerPool(contracts.pool) : []),
    ...(contracts.vaultV1 ? celerVaultV1(contracts.vaultV1) : []),
    ...(contracts.vaultV2 ? celerVaultV2(contracts.vaultV2) : []),
    ...(contracts.peggedV1 ? celerPeggedV1(contracts.peggedV1) : []),
    ...(contracts.peggedV2 ? celerPeggedV2(contracts.peggedV2) : []),
  ],
});
