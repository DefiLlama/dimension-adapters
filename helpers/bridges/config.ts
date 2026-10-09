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

// ---------------------------------------------------------------------------------------------------
// Circle CCTP TokenMessenger. V1 and V2 share event names but not signatures.
// https://developers.circle.com/cctp/evm-smart-contracts
// ---------------------------------------------------------------------------------------------------
const cctpV1 = (targets: string[]): BridgeEvent[] => [
  { eventAbi: "event DepositForBurn(uint64 indexed nonce, address indexed burnToken, uint256 amount, address indexed depositor, bytes32 mintRecipient, uint32 destinationDomain, bytes32 destinationTokenMessenger, bytes32 destinationCaller)", targets, direction: "outgoing", tokenArg: "burnToken", amountArg: "amount" },
  { eventAbi: "event MintAndWithdraw(address indexed mintRecipient, uint256 amount, address indexed mintToken)", targets, direction: "incoming", tokenArg: "mintToken", amountArg: "amount" },
];
const cctpV2 = (targets: string[]): BridgeEvent[] => [
  { eventAbi: "event DepositForBurn(address indexed burnToken, uint256 amount, address indexed depositor, bytes32 mintRecipient, uint32 destinationDomain, bytes32 destinationTokenMessenger, bytes32 destinationCaller, uint256 maxFee, uint32 indexed minFinalityThreshold, bytes hookData)", targets, direction: "outgoing", tokenArg: "burnToken", amountArg: "amount" },
  { eventAbi: "event MintAndWithdraw(address indexed mintRecipient, uint256 amount, address indexed mintToken, uint256 feeCollected)", targets, direction: "incoming", tokenArg: "mintToken", amountArg: "amount" },
];

export const cctpBridge = (contracts: { v1?: string; v2?: string }, start?: string): BridgeChainConfig => ({
  start,
  events: [...(contracts.v1 ? cctpV1([contracts.v1]) : []), ...(contracts.v2 ? cctpV2([contracts.v2]) : [])],
});

// ---------------------------------------------------------------------------------------------------
// Synapse: SynapseBridge (deposit/redeem out, withdraw/mint in) and the FastBridge RFQ contract.
// https://docs.synapseprotocol.com/docs/Contracts/Bridge
// ---------------------------------------------------------------------------------------------------
const synapseBridgeEvents = (targets: string[]): BridgeEvent[] => [
  ...[
    "event TokenDeposit(address indexed to, uint256 chainId, address token, uint256 amount)",
    "event TokenDepositAndSwap(address indexed to, uint256 chainId, address token, uint256 amount, uint8 tokenIndexFrom, uint8 tokenIndexTo, uint256 minDy, uint256 deadline)",
    "event TokenRedeem(address indexed to, uint256 chainId, address token, uint256 amount)",
    "event TokenRedeemAndSwap(address indexed to, uint256 chainId, address token, uint256 amount, uint8 tokenIndexFrom, uint8 tokenIndexTo, uint256 minDy, uint256 deadline)",
    "event TokenRedeemAndRemove(address indexed to, uint256 chainId, address token, uint256 amount, uint8 swapTokenIndex, uint256 swapMinAmount, uint256 swapDeadline)",
    "event TokenRedeemV2(bytes32 indexed to, uint256 chainId, address token, uint256 amount)",
  ].map((eventAbi): BridgeEvent => ({ eventAbi, targets, direction: "outgoing", tokenArg: "token", amountArg: "amount" })),
  ...[
    "event TokenWithdraw(address indexed to, address token, uint256 amount, uint256 fee, bytes32 indexed kappa)",
    "event TokenWithdrawAndRemove(address indexed to, address token, uint256 amount, uint256 fee, uint8 swapTokenIndex, uint256 swapMinAmount, uint256 swapDeadline, bool swapSuccess, bytes32 indexed kappa)",
    "event TokenMint(address indexed to, address token, uint256 amount, uint256 fee, bytes32 indexed kappa)",
    "event TokenMintAndSwap(address indexed to, address token, uint256 amount, uint256 fee, uint8 tokenIndexFrom, uint8 tokenIndexTo, uint256 minDy, uint256 deadline, bool swapSuccess, bytes32 indexed kappa)",
  ].map((eventAbi): BridgeEvent => ({ eventAbi, targets, direction: "incoming", tokenArg: "token", amountArg: "amount" })),
];
const synapseRfqEvents = (targets: string[]): BridgeEvent[] => [
  { eventAbi: "event BridgeRequested(bytes32 indexed transactionId, address indexed sender, bytes request, uint32 destChainId, address originToken, address destToken, uint256 originAmount, uint256 destAmount, bool sendChainGas)", targets, direction: "outgoing", tokenArg: "originToken", amountArg: "originAmount" },
  { eventAbi: "event BridgeRelayed(bytes32 indexed transactionId, address indexed relayer, address indexed to, uint32 originChainId, address originToken, address destToken, uint256 originAmount, uint256 destAmount, uint256 chainGasAmount)", targets, direction: "incoming", tokenArg: "destToken", amountArg: "destAmount" },
];

export const synapseBridge = (contracts: { bridge: string; rfq?: string }, start?: string): BridgeChainConfig => ({
  start,
  events: [...synapseBridgeEvents([contracts.bridge]), ...(contracts.rfq ? synapseRfqEvents([contracts.rfq]) : [])],
});

// ---------------------------------------------------------------------------------------------------
// Symbiosis: Portal locks originals (SynthesizeRequest out, BurnCompleted in), Synthesis mints and
// burns synthetic representations (BurnRequest out, SynthesizeCompleted in).
// https://docs.symbiosis.finance/developer-tools/symbiosis-contracts
// ---------------------------------------------------------------------------------------------------
const symbiosisPortal = (targets: string[]): BridgeEvent[] => [
  { eventAbi: "event SynthesizeRequest(bytes32 id, address indexed from, uint256 indexed chainID, address indexed revertableAddress, address to, uint256 amount, address token)", targets, direction: "outgoing", tokenArg: "token", amountArg: "amount" },
  { eventAbi: "event BurnCompleted(bytes32 indexed id, bytes32 indexed crossChainID, address indexed to, uint256 amount, uint256 bridgingFee, address token)", targets, direction: "incoming", tokenArg: "token", amountArg: "amount" },
];
const symbiosisSynthesis = (targets: string[]): BridgeEvent[] => [
  { eventAbi: "event BurnRequest(bytes32 id, address indexed from, uint256 indexed chainID, address indexed revertableAddress, address to, uint256 amount, address token)", targets, direction: "outgoing", tokenArg: "token", amountArg: "amount" },
  { eventAbi: "event SynthesizeCompleted(bytes32 indexed id, address indexed to, bytes32 indexed crossChainID, uint256 amount, uint256 bridgingFee, address token)", targets, direction: "incoming", tokenArg: "token", amountArg: "amount" },
];

export const symbiosisBridge = (contracts: { portal?: string; synthesis?: string }, start?: string, mapTokens?: Record<string, string>): BridgeChainConfig => ({
  start,
  events: [...(contracts.portal ? symbiosisPortal([contracts.portal]) : []), ...(contracts.synthesis ? symbiosisSynthesis([contracts.synthesis]) : [])]
    .map((event) => (mapTokens ? { ...event, mapTokens } : event)),
});

// ---------------------------------------------------------------------------------------------------
// CrossCurve (EYWA): PortalV2 locks/unlocks originals, SynthesisV2 burns, moves and mints synthetics.
// Same addresses on every chain. https://docs.crosscurve.fi
// ---------------------------------------------------------------------------------------------------
export const crossCurveBridge = (start?: string): BridgeChainConfig => {
  const portal = ["0xac8f44ceca92b2a4b30360e5bd3043850a0ffcbe"];
  const synthesis = ["0xf370D9Ed0141207e81321158393Eea5D8a50CC72"];
  return {
    start,
    events: [
      { eventAbi: "event Locked(address token, uint256 amount, address from, address to)", targets: portal, direction: "outgoing", tokenArg: "token", amountArg: "amount" },
      { eventAbi: "event Unlocked(address token, uint256 amount, address from, address to)", targets: portal, direction: "incoming", tokenArg: "token", amountArg: "amount" },
      { eventAbi: "event Burn(address token, uint256 amount, address from, address to)", targets: synthesis, direction: "outgoing", tokenArg: "token", amountArg: "amount" },
      { eventAbi: "event Move(address token, uint256 amount, address from, address to, uint64 chainIdTo)", targets: synthesis, direction: "outgoing", tokenArg: "token", amountArg: "amount" },
      { eventAbi: "event Synthesized(address token, uint256 amount, address from, address to)", targets: synthesis, direction: "incoming", tokenArg: "token", amountArg: "amount" },
    ],
  };
};

// ---------------------------------------------------------------------------------------------------
// rhino.fi bridge contract, one per chain. https://docs.rhino.fi
// ---------------------------------------------------------------------------------------------------
export const rhinoBridge = (bridge: string, start?: string): BridgeChainConfig => ({
  start,
  events: [
    { eventAbi: "event BridgedDepositWithId(address sender, address origin, address token, uint256 amount, uint256 commitmentId)", targets: [bridge], direction: "outgoing", tokenArg: "token", amountArg: "amount" },
    { eventAbi: "event BridgedWithdrawal(address user, address token, uint256 amount, string withdrawalId)", targets: [bridge], direction: "incoming", tokenArg: "token", amountArg: "amount" },
    // the native gas drop on top of the token is not bridged value, only amountToken counts
    { eventAbi: "event BridgedWithdrawalWithNative(address user, address token, uint256 amountToken, uint256 amountNative)", targets: [bridge], direction: "incoming", tokenArg: "token", amountArg: "amountToken" },
  ],
});

// ---------------------------------------------------------------------------------------------------
// Wrap/unwrap token bridges (Fuse, Shimmer). On the wrapped side, UnwrapToken burns the wrapped token
// to leave the chain and WrapToken mints it on arrival.
// ---------------------------------------------------------------------------------------------------
const wrapTokenEvents = (targets: string[], unwrapIs: "outgoing" | "incoming"): BridgeEvent[] => [
  { eventAbi: "event UnwrapToken(address localToken, address remoteToken, uint16 remoteChainId, address to, uint256 amount)", targets, direction: unwrapIs, tokenArg: "localToken", amountArg: "amount" },
  { eventAbi: "event WrapToken(address localToken, address remoteToken, uint16 remoteChainId, address to, uint256 amount)", targets, direction: unwrapIs === "outgoing" ? "incoming" : "outgoing", tokenArg: "localToken", amountArg: "amount" },
];

// Fuse: wrapped-token bridge on L2s plus the native SendToken/ReceiveToken bridge
export const fuseBridge = (contracts: { wrapped?: string; native?: string }, start?: string): BridgeChainConfig => ({
  start,
  events: [
    ...(contracts.wrapped ? wrapTokenEvents([contracts.wrapped], "outgoing") : []),
    ...(contracts.native ? [
      { eventAbi: "event SendToken(address token, address from, address to, uint256 amount)", targets: [contracts.native], direction: "outgoing", tokenArg: "token", amountArg: "amount" },
      { eventAbi: "event ReceiveToken(address token, address to, uint256 amount)", targets: [contracts.native], direction: "incoming", tokenArg: "token", amountArg: "amount" },
    ] as BridgeEvent[] : []),
  ],
});

// ShimmerEVM side of the Shimmer bridge: WrapToken locks local tokens to leave, UnwrapToken releases them
export const shimmerBridge = (bridge: string, start?: string): BridgeChainConfig => ({ start, events: wrapTokenEvents([bridge], "incoming") });

// ---------------------------------------------------------------------------------------------------
// Connext (Everclear v1) ConnextDiamond: XCalled out, Executed in.
// https://docs.connext.network/resources/deployments
// ---------------------------------------------------------------------------------------------------
const CONNEXT_CALL_PARAMS = "(uint32 originDomain, uint32 destinationDomain, uint32 canonicalDomain, address to, address delegate, bool receiveLocal, bytes callData, uint256 slippage, address originSender, uint256 bridgedAmt, uint256 normalizedIn, uint256 nonce, bytes32 canonicalId)";
export const connextBridge = (diamond: string, start?: string): BridgeChainConfig => ({
  start,
  events: [
    { eventAbi: `event XCalled(bytes32 indexed transferId, uint256 indexed nonce, bytes32 indexed messageHash, ${CONNEXT_CALL_PARAMS} params, address asset, uint256 amount, address local, bytes messageBody)`, targets: [diamond], direction: "outgoing", tokenArg: "asset", amountArg: "amount" },
    { eventAbi: `event Executed(bytes32 indexed transferId, address indexed to, address indexed asset, (${CONNEXT_CALL_PARAMS} params, address[] routers, bytes[] routerSignatures, address sequencer, bytes sequencerSignature) args, address local, uint256 amount, address caller)`, targets: [diamond], direction: "incoming", tokenArg: "asset", amountArg: "amount" },
  ],
});

// ---------------------------------------------------------------------------------------------------
// CrowdSwap cross-chain routers, same two router addresses on every chain.
// ---------------------------------------------------------------------------------------------------
export const crowdSwapBridge = (start?: string): BridgeChainConfig => {
  const targets = ["0x549D287218E5fc9D07A91Fe2e1337D5c21B808B2", "0x30462a4863a3db9233006a87320a8e07c4a71a36"];
  return {
    start,
    events: [
      { eventAbi: "event MessageSent(bytes32 indexed messageId, uint256 sourceAmount, uint256 feeAmount, uint256 destinationAmount, uint256 destinationMinAmount, address sourceTokenAddress, address destinationTokenAddress, address sender, uint64 indexed destinationChainId)", targets, direction: "outgoing", tokenArg: "sourceTokenAddress", amountArg: "sourceAmount" },
      { eventAbi: "event MessageCompleted(bytes32 indexed messageId, uint256 destinationAmount, address destinationTokenAddress, address receiver)", targets, direction: "incoming", tokenArg: "destinationTokenAddress", amountArg: "destinationAmount" },
    ],
  };
};

// ---------------------------------------------------------------------------------------------------
// Polygon zkEVM / Agglayer unified bridge (PolygonZkEVMBridge, same address on every connected chain).
// Events carry the token's address on its origin network: Ethereum-origin tokens (originNetwork 0,
// native ETH as the zero address) are priced as Ethereum tokens, anything else as a local address.
// ClaimEvent switched its first arg from uint32 index to uint256 globalIndex in the V2 upgrade.
// https://docs.agglayer.dev/agglayer/core-concepts/unified-bridge/
// ---------------------------------------------------------------------------------------------------
const AGGLAYER_BRIDGE = "0x2a3DD3EB832aF982ec71669E178424b10Dca2EDe";
const isEthereumOrigin = (args: any) => Number(args.originNetwork) === 0;
const agglayerEvents = (): BridgeEvent[] => [
  "event BridgeEvent(uint8 leafType, uint32 originNetwork, address originAddress, uint32 destinationNetwork, address destinationAddress, uint256 amount, bytes metadata, uint32 depositCount)",
  "event ClaimEvent(uint32 index, uint32 originNetwork, address originAddress, address destinationAddress, uint256 amount)",
  "event ClaimEvent(uint256 globalIndex, uint32 originNetwork, address originAddress, address destinationAddress, uint256 amount)",
].flatMap((eventAbi): BridgeEvent[] => {
  const base: BridgeEvent = { eventAbi, targets: [AGGLAYER_BRIDGE], direction: eventAbi.startsWith("event BridgeEvent") ? "outgoing" : "incoming", tokenArg: "originAddress", amountArg: "amount" };
  return [
    { ...base, tokenChain: "ethereum", filter: isEthereumOrigin },
    { ...base, filter: (args: any) => !isEthereumOrigin(args) },
  ];
});

export const agglayerBridge = (start?: string, deadFrom?: string): BridgeChainConfig => ({ start, deadFrom, events: agglayerEvents() });

// ---------------------------------------------------------------------------------------------------
// LayerZero OFT v2: OFTSent on the sending chain, OFTReceived on the receiving one. `oapp` is the OFT
// or OFT adapter (lockbox) contract, `token` the asset it moves on that chain.
// https://docs.layerzero.network/v2/developers/evm/oft/quickstart
// ---------------------------------------------------------------------------------------------------
export const oftEvents = (oapp: string, token: string): BridgeEvent[] => [
  { eventAbi: "event OFTSent(bytes32 indexed guid, uint32 dstEid, address indexed fromAddress, uint256 amountSentLD, uint256 amountReceivedLD)", targets: [oapp], direction: "outgoing", fixedToken: token, amountArg: "amountSentLD" },
  { eventAbi: "event OFTReceived(bytes32 indexed guid, uint32 srcEid, address indexed toAddress, uint256 amountReceivedLD)", targets: [oapp], direction: "incoming", fixedToken: token, amountArg: "amountReceivedLD" },
];

// ---------------------------------------------------------------------------------------------------
// Polygon PoS bridge on Ethereum. ERC20 deposits from the ERC20Predicate's LockedERC20, ERC20
// withdrawals as transfers out of that predicate (exits emit no amount-carrying event), ETH through
// the EtherPredicate. https://docs.polygon.technology/pos/how-to/bridging/ethereum-polygon/
// ---------------------------------------------------------------------------------------------------
export const polygonPosBridge = (start?: string): BridgeChainConfig => {
  const erc20Predicate = "0x40ec5B33f54e0E8A33A975908C5BA1c14e5BbbDf";
  const etherPredicate = "0x8484Ef722627bf18ca5Ae6BcF031c23E6e922B30";
  return {
    start,
    events: [
      { eventAbi: "event LockedERC20(address indexed depositor, address indexed depositReceiver, address indexed rootToken, uint256 amount)", targets: [erc20Predicate], direction: "outgoing", tokenArg: "rootToken", amountArg: "amount" },
      { eventAbi: "event LockedEther(address indexed depositor, address indexed depositReceiver, uint256 amount)", targets: [etherPredicate], direction: "outgoing", fixedToken: ADDRESSES.null, amountArg: "amount" },
      { eventAbi: "event ExitedEther(address indexed exitor, uint256 amount)", targets: [etherPredicate], direction: "incoming", fixedToken: ADDRESSES.null, amountArg: "amount" },
    ],
    transfers: { wallets: [erc20Predicate], direction: "incoming" },
  };
};

// ---------------------------------------------------------------------------------------------------
// Allbridge Classic: lock/burn deposits arrive as transfers into the bridge, unlocks/mints emit Received.
// Same bridge address on every chain. https://docs-classic.allbridge.io
// ---------------------------------------------------------------------------------------------------
export const allbridgeClassicBridge = (start?: string): BridgeChainConfig => {
  const bridge = "0xBBbD1BbB4f9b936C3604906D7592A644071dE884";
  return {
    start,
    events: [{ eventAbi: "event Received(address indexed recipient, address token, uint256 amount, uint128 indexed lockId, bytes4 source)", targets: [bridge], direction: "incoming", tokenArg: "token", amountArg: "amount" }],
    transfers: { wallets: [bridge], direction: "outgoing" },
  };
};

// ---------------------------------------------------------------------------------------------------
// Gnosis Chain bridges: OmniBridge (any ERC20) and the xDai bridge (DAI on Ethereum <-> xDAI on Gnosis).
// https://docs.gnosischain.com/bridges/About%20Token%20Bridges/omnibridge
// ---------------------------------------------------------------------------------------------------
const omnibridgeEvents = (mediator: string): BridgeEvent[] => [
  { eventAbi: "event TokensBridgingInitiated(address indexed token, address indexed sender, uint256 value, bytes32 indexed messageId)", targets: [mediator], direction: "outgoing", tokenArg: "token", amountArg: "value" },
  { eventAbi: "event TokensBridged(address indexed token, address indexed recipient, uint256 value, bytes32 indexed messageId)", targets: [mediator], direction: "incoming", tokenArg: "token", amountArg: "value" },
];
// the xDai bridge invests idle DAI in sDAI; those moves are not user transfers
const SDAI = "0x83f20f44975d03b1b09e64809b757c47f942beea";

export const gnosisBridgeEthereum = (start?: string): BridgeChainConfig => ({
  start,
  events: omnibridgeEvents("0x88ad09518695c6c3712AC10a214bE5109a655671"),
  transfers: {
    wallets: ["0x4aa42145Aa6Ebf72e164C9bBC74fbD3788045016"], // xDai bridge foreign side
    filter: (row: any) => String(row.from_address).toLowerCase() !== SDAI && String(row.to_address).toLowerCase() !== SDAI,
  },
});

export const gnosisBridgeGnosis = (start?: string): BridgeChainConfig => {
  const xdaiHome = ["0x7301CFA0e1756B71869E93d4e4Dca5c7d0eb0AA6"];
  return {
    start,
    events: [
      ...omnibridgeEvents("0xf6A78083ca3e2a662D6dd1703c939c8aCE2e268d"),
      // native xDAI, priced as WXDAI
      { eventAbi: "event UserRequestForSignature(address recipient, uint256 value)", targets: xdaiHome, direction: "outgoing", fixedToken: "0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d", amountArg: "value" },
      { eventAbi: "event AffirmationCompleted(address recipient, uint256 value, bytes32 transactionHash)", targets: xdaiHome, direction: "incoming", fixedToken: "0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d", amountArg: "value" },
    ],
  };
};

// ---------------------------------------------------------------------------------------------------
// XSwap CCIP router, same address on every chain. Native transfers report the zero address.
// ---------------------------------------------------------------------------------------------------
export const xswapBridge = (start?: string): BridgeChainConfig => {
  const targets = ["0xe1c14b9f065dead2e89ee35382f8bd42bdb87a04"];
  return {
    start,
    events: [
      { eventAbi: "event MessageSent(bytes32 indexed messageId, uint64 indexed destinationChainSelector, address indexed sender, bytes data, address token, uint256 tokenAmount, uint256 valueForInstantCcipRecieve, address transferedToken, uint256 transferedTokenAmount)", targets, direction: "outgoing", tokenArg: "token", amountArg: "tokenAmount" },
      { eventAbi: "event MessageReceived(bytes32 indexed messageId, uint64 indexed sourceChainSelector, address indexed sender, bytes data, address token, uint256 tokenAmount)", targets, direction: "incoming", tokenArg: "token", amountArg: "tokenAmount" },
    ],
  };
};

// ---------------------------------------------------------------------------------------------------
// Aori: Deposit locks the order's input on the source chain, Withdraw releases balances on the
// destination. Native gas token is reported as 0xEeee...EEeE. https://docs.aori.io
// ---------------------------------------------------------------------------------------------------
const AORI_NATIVE = { "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee": ADDRESSES.null };
export const aoriBridge = (contract: string, start?: string): BridgeChainConfig => ({
  start,
  events: [
    { eventAbi: "event Deposit(bytes32 indexed orderId, (uint128 inputAmount, uint128 outputAmount, address inputToken, address outputToken, uint32 startTime, uint32 endTime, uint32 srcEid, uint32 dstEid, address offerer, address recipient) order)", targets: [contract], direction: "outgoing", tokenArg: "order.inputToken", amountArg: "order.inputAmount", mapTokens: AORI_NATIVE },
    { eventAbi: "event Withdraw(address indexed holder, address indexed token, uint256 amount)", targets: [contract], direction: "incoming", tokenArg: "token", amountArg: "amount", mapTokens: AORI_NATIVE },
  ],
});

// ---------------------------------------------------------------------------------------------------
// Helixbox LnBridge: TokenLocked on the source chain, TransferFilledExt when a relayer fills on the
// destination. https://docs.helixbridge.app
// ---------------------------------------------------------------------------------------------------
export const helixboxBridge = (contract: string, start?: string): BridgeChainConfig => ({
  start,
  events: [
    { eventAbi: "event TokenLocked((uint256 remoteChainId, address provider, address sourceToken, address targetToken, uint112 totalFee, uint112 amount, address receiver, uint256 timestamp) params, bytes32 transferId, uint112 targetAmount, uint112 fee)", targets: [contract], direction: "outgoing", tokenArg: "params.sourceToken", amountArg: "params.amount" },
    { eventAbi: "event TransferFilledExt(bytes32 transferId, (uint256 remoteChainId, address provider, address sourceToken, address targetToken, uint112 sourceAmount, uint112 targetAmount, address receiver, uint256 timestamp) params)", targets: [contract], direction: "incoming", tokenArg: "params.targetToken", amountArg: "params.targetAmount" },
  ],
});

// ---------------------------------------------------------------------------------------------------
// UniversalX deposit vault. Refunded returns a failed deposit to its sender on the same chain and
// is not bridged value. https://docs.universalx.app
// ---------------------------------------------------------------------------------------------------
export const universalXBridge = (vault: string, start?: string): BridgeChainConfig => ({
  start,
  events: [
    { eventAbi: "event Deposited(address indexed user, uint256 amount, address tokenAddress)", targets: [vault], direction: "outgoing", tokenArg: "tokenAddress", amountArg: "amount" },
    { eventAbi: "event Released(address indexed recipient, uint256 amount, address tokenAddress)", targets: [vault], direction: "incoming", tokenArg: "tokenAddress", amountArg: "amount" },
  ],
});

// ---------------------------------------------------------------------------------------------------
// Eclipse canonical bridge on Ethereum (ETH only). https://docs.eclipse.xyz
// ---------------------------------------------------------------------------------------------------
export const eclipseBridge = (start?: string): BridgeChainConfig => {
  const targets = ["0x2B08D7cF7EafF0f5f6623d9fB09b080726D4be11"];
  return {
    start,
    events: [
      { eventAbi: "event Deposited(address indexed sender, bytes32 indexed recipient, uint256 amountWei, uint256 amountLamports)", targets, direction: "outgoing", fixedToken: ADDRESSES.null, amountArg: "amountWei" },
      { eventAbi: "event WithdrawClaimed(address indexed receiver, bytes32 indexed remoteSender, bytes32 indexed messageHash, (bytes32 from, address destination, uint256 amountWei, uint64 withdrawId, address feeReceiver, uint256 feeWei) message)", targets, direction: "incoming", fixedToken: ADDRESSES.null, amountArg: "message.amountWei" },
    ],
  };
};

// ---------------------------------------------------------------------------------------------------
// Rootstock PowPeg Fast Mode (Flyover) LiquidityBridgeContract, native RBTC. PegOutDeposit locks RBTC
// to leave for Bitcoin; CallForUser is the liquidity provider delivering a peg-in (failed calls deliver nothing).
// https://dev.rootstock.io/developers/integrate/flyover/
// ---------------------------------------------------------------------------------------------------
export const flyoverBridge = (start?: string): BridgeChainConfig => {
  const targets = ["0xAA9cAf1e3967600578727F975F283446A3Da6612"];
  return {
    start,
    events: [
      { eventAbi: "event PegOutDeposit(bytes32 indexed quoteHash, address indexed sender, uint256 amount, uint256 timestamp)", targets, direction: "outgoing", fixedToken: ADDRESSES.null, amountArg: "amount" },
      { eventAbi: "event CallForUser(address indexed from, address indexed dest, uint256 gasLimit, uint256 value, bytes data, bool success, bytes32 quoteHash)", targets, direction: "incoming", fixedToken: ADDRESSES.null, amountArg: "value", filter: (args: any) => args.success === true },
    ],
  };
};

// ---------------------------------------------------------------------------------------------------
// Bitcoin bridges that mint a wrapped BTC on an EVM chain: mint = BTC arriving, burn/redeem = leaving.
// ---------------------------------------------------------------------------------------------------
// Core Bitcoin Bridge, BTC.b on Avalanche. https://core.app/bridge
export const coreBitcoinBridge = (start?: string): BridgeChainConfig => {
  const btcb = "0x152b9d0FdC40C096757F570A51E494bd4b943E50";
  return {
    start,
    events: [
      { eventAbi: "event Unwrap(uint256 amount, uint256 chainId)", targets: [btcb], direction: "outgoing", fixedToken: btcb, amountArg: "amount" },
      { eventAbi: "event Mint(address to, uint256 amount, address feeAddress, uint256 feeAmount, bytes32 originTxId, uint256 originOutputIndex)", targets: [btcb], direction: "incoming", fixedToken: btcb, amountArg: "amount" },
    ],
  };
};

// Threshold tBTC: the TBTCVault mints tBTC for confirmed Bitcoin deposits and unmints on redemption.
// https://docs.threshold.network/applications/tbtc-v2
export const thresholdTbtcBridge = (start?: string): BridgeChainConfig => {
  const vault = ["0x9C070027cdC9dc8F82416B2e5314E11DFb4FE3CD"];
  const tbtc = "0x18084fbA666a33d37592fA2633fD49a74DD93a88";
  return {
    start,
    events: [
      { eventAbi: "event Unminted(address indexed from, uint256 amount)", targets: vault, direction: "outgoing", fixedToken: tbtc, amountArg: "amount" },
      { eventAbi: "event Minted(address indexed to, uint256 amount)", targets: vault, direction: "incoming", fixedToken: tbtc, amountArg: "amount" },
    ],
  };
};

// ---------------------------------------------------------------------------------------------------
// Asset Chain bridge, Asset Chain side: one bridge contract per bridged asset. SentTokens leaves Asset
// Chain, FulfilledTokens delivers an inbound transfer. https://docs.assetchain.org
// ---------------------------------------------------------------------------------------------------
export const assetChainBridge = (bridges: { bridge: string; token: string }[], start?: string): BridgeChainConfig => ({
  start,
  events: bridges.flatMap(({ bridge, token }): BridgeEvent[] => [
    { eventAbi: "event SentTokens(address fromUser, string indexed toUser, string fromChain, string toChain, uint256 amount, uint256 exchangeRate)", targets: [bridge], direction: "outgoing", fixedToken: token, amountArg: "amount" },
    { eventAbi: "event FulfilledTokens(string indexed fromUser, address indexed toUser, string fromChain, string toChain, uint256 amount, uint256 exchangeRate)", targets: [bridge], direction: "incoming", fixedToken: token, amountArg: "amount" },
  ]),
});

// ---------------------------------------------------------------------------------------------------
// Stargate. v2 pools and OFTs emit OFTSent/OFTReceived (zero address token = native gas token).
// v1 pools emit Swap/SwapRemote in shared decimals; only pools whose shared decimals equal the
// underlying token's are listed, the rest would need rescaling. STG bridges as an OFT: on Ethereum it
// emits SendToChain/ReceiveFromChain, elsewhere it burns to and mints from the zero address.
// https://stargateprotocol.gitbook.io/stargate/v2-user-docs/technical-reference/mainnet-contracts
// ---------------------------------------------------------------------------------------------------
const stargateV1Events = (pool: string, token: string): BridgeEvent[] => [
  { eventAbi: "event Swap(uint16 chainId, uint256 dstPoolId, address from, uint256 amountSD, uint256 eqReward, uint256 eqFee, uint256 protocolFee, uint256 lpFee)", targets: [pool], direction: "outgoing", fixedToken: token, amountArg: "amountSD" },
  { eventAbi: "event SwapRemote(address to, uint256 amountSD, uint256 protocolFee, uint256 dstFee)", targets: [pool], direction: "incoming", fixedToken: token, amountArg: "amountSD" },
];
const STG_ETHEREUM = "0xAf5191B0De278C7286d6C7CC6ab6BB8A73bA2Cd6";
const stgEvents = (stg: string): BridgeEvent[] => stg === STG_ETHEREUM
  ? [
    { eventAbi: "event SendToChain(uint16 dstChainId, bytes to, uint256 qty)", targets: [stg], direction: "outgoing", fixedToken: stg, amountArg: "qty" },
    { eventAbi: "event ReceiveFromChain(uint16 srcChainId, uint64 nonce, uint256 qty)", targets: [stg], direction: "incoming", fixedToken: stg, amountArg: "qty" },
  ]
  : [
    { eventAbi: "event Transfer(address indexed from, address indexed to, uint256 value)", targets: [stg], direction: "outgoing", fixedToken: stg, amountArg: "value", filter: (args: any) => String(args.to).toLowerCase() === ADDRESSES.null },
    { eventAbi: "event Transfer(address indexed from, address indexed to, uint256 value)", targets: [stg], direction: "incoming", fixedToken: stg, amountArg: "value", filter: (args: any) => String(args.from).toLowerCase() === ADDRESSES.null },
  ];

/** v2 and v1 are [pool, token] pairs. */
export const stargateBridge = (contracts: { v2?: [string, string][]; v1?: [string, string][]; stg?: string }, start?: string): BridgeChainConfig => ({
  start,
  events: [
    ...(contracts.v2 ?? []).flatMap(([pool, token]) => oftEvents(pool, token)),
    ...(contracts.v1 ?? []).flatMap(([pool, token]) => stargateV1Events(pool, token)),
    ...(contracts.stg ? stgEvents(contracts.stg) : []),
  ],
});

// ---------------------------------------------------------------------------------------------------
// Hop: one bridge contract per token per chain. L1 bridges send with TransferSentToL2 and pay out bonded
// withdrawals; L2 bridges send with TransferSent and receive from L1 or from bonded L2 transfers.
// https://github.com/hop-protocol/hop/blob/develop/packages/core/src/addresses/mainnet.ts
// ---------------------------------------------------------------------------------------------------
const HOP_WITHDRAWAL_BONDED = "event WithdrawalBonded(bytes32 indexed transferId, uint256 amount)";

/** [bridge, canonical token] pairs. */
export const hopL1Bridge = (bridges: [string, string][], start?: string): BridgeChainConfig => ({
  start,
  events: bridges.flatMap(([bridge, token]): BridgeEvent[] => [
    { eventAbi: "event TransferSentToL2(uint256 indexed chainId, address indexed recipient, uint256 amount, uint256 amountOutMin, uint256 deadline, address indexed relayer, uint256 relayerFee)", targets: [bridge], direction: "outgoing", fixedToken: token, amountArg: "amount" },
    { eventAbi: HOP_WITHDRAWAL_BONDED, targets: [bridge], direction: "incoming", fixedToken: token, amountArg: "amount" },
  ]),
});

export const hopL2Bridge = (bridges: [string, string][], start?: string): BridgeChainConfig => ({
  start,
  events: bridges.flatMap(([bridge, token]): BridgeEvent[] => [
    { eventAbi: "event TransferSent(bytes32 indexed transferId, uint256 indexed chainId, address indexed recipient, uint256 amount, bytes32 transferNonce, uint256 bonderFee, uint256 index, uint256 amountOutMin, uint256 deadline)", targets: [bridge], direction: "outgoing", fixedToken: token, amountArg: "amount" },
    { eventAbi: "event TransferFromL1Completed(address indexed recipient, uint256 amount, uint256 amountOutMin, uint256 deadline, address indexed relayer, uint256 relayerFee)", targets: [bridge], direction: "incoming", fixedToken: token, amountArg: "amount" },
    { eventAbi: HOP_WITHDRAWAL_BONDED, targets: [bridge], direction: "incoming", fixedToken: token, amountArg: "amount" },
  ]),
});

// ---------------------------------------------------------------------------------------------------
// zkBridge (Polyhedra) token bridges: each contract serves several pools, the poolId picks the token.
// ---------------------------------------------------------------------------------------------------
/** pools maps poolId to the token it moves on this chain. */
export const zkBridgeEvents = (contract: string, pools: Record<number, string>): BridgeEvent[] => {
  const mapTokens = Object.fromEntries(Object.entries(pools).map(([poolId, token]) => [poolId, token.toLowerCase()]));
  const knownPool = (args: any) => String(args.poolId) in mapTokens;
  return [
    { eventAbi: "event TransferToken(uint64 indexed sequence, uint16 indexed dstChainId, uint256 indexed poolId, address sender, address recipient, uint256 amount)", targets: [contract], direction: "outgoing", tokenArg: "poolId", mapTokens, amountArg: "amount", filter: knownPool },
    { eventAbi: "event ReceiveToken(uint64 indexed sequence, uint16 indexed srcChainId, uint256 indexed poolId, address recipient, uint256 amount)", targets: [contract], direction: "incoming", tokenArg: "poolId", mapTokens, amountArg: "amount", filter: knownPool },
  ];
};

export const zkBridge = (contracts: [string, Record<number, string>][], start?: string): BridgeChainConfig => ({
  start,
  events: contracts.flatMap(([contract, pools]) => zkBridgeEvents(contract, pools)),
});

// ---------------------------------------------------------------------------------------------------
// XY Finance: yBridge (SwapRequested out, SwappedForUser in) and XYRouter requests routed through other
// bridges (yBridge-routed requests are skipped, its own events count them). Native is 0xEeee...EEeE.
// https://docs.xy.finance/smart-contract/addresses
// ---------------------------------------------------------------------------------------------------
const XY_NATIVE = { "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee": ADDRESSES.null };
export const xyBridge = (contracts: { yBridge: string; router: string }, start?: string): BridgeChainConfig => ({
  start,
  events: [
    { eventAbi: "event XYRouterRequested(uint256 xyRouterRequestId, address indexed sender, address srcToken, uint256 amountIn, address indexed bridgeAddress, address bridgeToken, uint256 bridgeAmount, uint256 dstChainId, bytes bridgeAssetReceiver, ((bool hasTip, address tipReceiver) tipInfo, (bool hasDstChainSwap, ((address srcToken, address dstToken, uint256 minReturnAmount, address receiver) swapRequest, address dexAddress, address approveToAddress, bytes dexCalldata) swapAction) dstChainSwapInfo, (bool hasIM, address xApp, address refundReceiver, bytes message) imInfo) dstChainAction, address indexed affiliate)", targets: [contracts.router], direction: "outgoing", tokenArg: "bridgeToken", amountArg: "bridgeAmount", mapTokens: XY_NATIVE, filter: (args: any) => String(args.bridgeAddress).toLowerCase() !== contracts.yBridge.toLowerCase() },
    { eventAbi: "event SwapRequested(uint256 _swapId, address indexed _aggregatorAdaptor, (uint32 dstChainId, address dstChainToken, address dstAggregatorAdaptor, uint256 expectedDstChainTokenAmount, uint32 slippage) _dstChainDesc, address _srcToken, address indexed _vaultToken, uint256 _vaultTokenAmount, address _receiver, uint256 _srcTokenAmount, uint256 _expressFeeAmount, address indexed _referrer)", targets: [contracts.yBridge], direction: "outgoing", tokenArg: "_vaultToken", amountArg: "_vaultTokenAmount", mapTokens: XY_NATIVE },
    { eventAbi: "event SwappedForUser(address indexed _aggregatorAdaptor, address indexed _srcToken, uint256 _srcTokenAmount, address _dstToken, uint256 _dstTokenAmountOut, address _receiver)", targets: [contracts.yBridge], direction: "incoming", tokenArg: "_dstToken", amountArg: "_dstTokenAmountOut", mapTokens: XY_NATIVE },
  ],
});

// ---------------------------------------------------------------------------------------------------
// Wanchain WanBridge Portal: lock/burn to leave the chain, release/mint on arrival. Native coin is the
// zero address. https://docs.wanchain.org
// ---------------------------------------------------------------------------------------------------
export const wanBridge = (portal: string, start?: string): BridgeChainConfig => ({
  start,
  events: [
    { eventAbi: "event UserLockLogger(bytes32 indexed smgID, uint256 indexed tokenPairID, address indexed tokenAccount, uint256 value, uint256 contractFee, bytes userAccount)", targets: [portal], direction: "outgoing", tokenArg: "tokenAccount", amountArg: "value" },
    { eventAbi: "event UserBurnLogger(bytes32 indexed smgID, uint256 indexed tokenPairID, address indexed tokenAccount, uint256 value, uint256 contractFee, uint256 fee, bytes userAccount)", targets: [portal], direction: "outgoing", tokenArg: "tokenAccount", amountArg: "value" },
    { eventAbi: "event SmgReleaseLogger(bytes32 indexed uniqueID, bytes32 indexed smgID, uint256 indexed tokenPairID, uint256 value, address tokenAccount, address userAccount)", targets: [portal], direction: "incoming", tokenArg: "tokenAccount", amountArg: "value" },
    { eventAbi: "event SmgMintLogger(bytes32 indexed uniqueID, bytes32 indexed smgID, uint256 indexed tokenPairID, uint256 value, address tokenAccount, address userAccount)", targets: [portal], direction: "incoming", tokenArg: "tokenAccount", amountArg: "value" },
  ],
});

// ---------------------------------------------------------------------------------------------------
// Rainbow Bridge ERC20 locker on Ethereum (Near/Aurora side is non-EVM). Unlocked carries no token, so
// withdrawals are read as transfers out of the locker. https://doc.aurora.dev/bridge/introduction
// ---------------------------------------------------------------------------------------------------
export const rainbowBridge = (start?: string): BridgeChainConfig => {
  const locker = "0x23Ddd3e3692d1861Ed57EDE224608875809e127f";
  return {
    start,
    events: [{ eventAbi: "event Locked(address indexed token, address indexed sender, uint256 amount, string accountId)", targets: [locker], direction: "outgoing", tokenArg: "token", amountArg: "amount" }],
    transfers: { wallets: [locker], direction: "incoming" },
  };
};

// ---------------------------------------------------------------------------------------------------
// StarkGate on Ethereum (Starknet side is non-EVM). Deposits from each token bridge; withdrawals are L2->L1
// messages to a bridge on the Starknet core contract, amount low 128 bits at payload[3].
// https://docs.starknet.io/tools/bridged-tokens/
// ---------------------------------------------------------------------------------------------------
/** bridges maps each StarkGate token bridge to the L1 token it holds (zero address for ETH). */
export const starkgateBridge = (bridges: Record<string, string>, start?: string): BridgeChainConfig => {
  const tokenByBridge = Object.fromEntries(Object.entries(bridges).map(([bridge, token]) => [bridge.toLowerCase(), token.toLowerCase()]));
  return {
    start,
    events: [
      // the ETH bridge reports the 'ETH' sentinel as its token, the others the L1 token
      { eventAbi: "event Deposit(address indexed sender, address indexed token, uint256 amount, uint256 indexed l2Recipient, uint256 nonce, uint256 fee)", targets: Object.keys(bridges), direction: "outgoing", tokenArg: "token", amountArg: "amount", mapTokens: { "0x0000000000000000000000000000000000455448": ADDRESSES.null } },
      // withdrawals are type 0 (TRANSFER_FROM_STARKNET) with payload [0, recipient, token, amount_low, amount_high];
      // bridges also receive other, shorter message types
      { eventAbi: "event LogMessageToL1(uint256 indexed fromAddress, address indexed toAddress, uint256[] payload)", targets: ["0xc662c410C0ECf747543f5bA90660f6ABeBD9C8c4"], direction: "incoming", tokenArg: "toAddress", mapTokens: tokenByBridge, amountArg: "payload.3", filter: (args: any) => String(args.toAddress).toLowerCase() in tokenByBridge && args.payload.length === 5 && Number(args.payload[0]) === 0 },
    ],
  };
};
