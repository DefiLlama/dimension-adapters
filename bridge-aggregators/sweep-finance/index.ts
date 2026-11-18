import { ethers } from "ethers";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { RELAY_LISTED_UNTIL, relayTotals } from "../../aggregators/sweep-finance/relay";
import { CHAIN } from "../../helpers/chains";

// Sweep (https://trysweep.finance) - turns many token balances across chains into one or two tokens in one go, sending
// each balance over the route it finds best. Legs that cross chains are counted here, on the chain they are sent from;
// swaps on one chain are in aggregators/sweep-finance.
//
// Each leg is an order with the bridge that carries it, and a leg is Sweep's when its order pays a nonzero fee to
// Sweep's fee wallet:
// - Across: one deposit into the SpokePool of the chain paid from, to Across's MulticallHandler on the chain paid to,
//   whose message holds the instructions the handler runs on arrival, among them paying Sweep's fee to Sweep's fee
//   wallet. A FundsDeposited log to that handler whose decoded instructions pay that wallet a nonzero fee is Sweep's.
//   SpokePools and handlers: https://github.com/across-protocol/contracts/blob/master/broadcast/deployed-addresses.json
//   Instructions: https://github.com/across-protocol/contracts/blob/master/contracts/handlers/MulticallHandler.sol
// - Mayan: orders are sent through Mayan's Forwarder, which passes the order call on to one of Mayan's protocols
//   (Swift, MCTP, Fast MCTP) and logs that call with the token and amount handed over. A forwarded order whose decoded
//   call names Sweep's fee wallet as referrer with a nonzero referrer fee is Sweep's.
//   Forwarder: https://github.com/mayan-finance/swap-sdk/blob/main/src/addresses.ts (MAYAN_FORWARDER_CONTRACT)
//   Order calls: https://github.com/mayan-finance/swap-sdk/tree/main/src/evm
// - Relay: Sweep's requests to another chain that pay Sweep's fee wallet an app fee, with the figures Relay reports
//   (aggregators/sweep-finance/relay.ts).
// Sweep's legs through Symbiosis are not counted.

// Sweep's fee wallet on EVM chains: the appFeeRecipient of its Across routes, the referrer of its Mayan orders and the app
// fee recipient of its Relay requests (also the affiliate of its Fly swaps, aggregators/sweep-finance).
const FEE_WALLET = "0xc5205f558d955f60313c3f08986af56e24ad94ad";

const ACROSS_DEPOSIT = "event FundsDeposited(bytes32 inputToken, bytes32 outputToken, uint256 inputAmount, uint256 outputAmount, uint256 indexed destinationChainId, uint256 indexed depositId, uint32 quoteTimestamp, uint32 fillDeadline, uint32 exclusivityDeadline, bytes32 indexed depositor, bytes32 recipient, bytes32 exclusiveRelayer, bytes message)";

// MulticallHandler's Instructions struct: the calls it makes on arrival, and who gets the tokens if one fails.
const ACROSS_INSTRUCTIONS = ["tuple(tuple(address target, bytes callData, uint256 value)[] calls, address fallbackRecipient)"];

// transfer(address to, uint256 amount) calldata: this selector, then two 32-byte ABI words, the address in the last 20
// bytes of the first.
const ERC20_TRANSFER = "0xa9059cbb";
const TRANSFER_CALLDATA_LENGTH = 2 + 8 + 2 * 64;

// The MulticallHandler a deposit to each destination chain id is paid to, the recipient Across's Swap API sets for
// Sweep's routes: MulticallHandler in deployed-addresses.json (above), the same address on most chains. A leg to a
// chain that file lists no MulticallHandler for (Robinhood Chain) is not counted.
const MULTICALL_HANDLER = "0x0f7ae28de1c8532170ad4ee566b5801485c13a0e";
const ACROSS_HANDLERS: Record<string, string> = {
  1: MULTICALL_HANDLER, // Ethereum
  10: MULTICALL_HANDLER, // Optimism
  56: MULTICALL_HANDLER, // BNB Chain
  130: MULTICALL_HANDLER, // Unichain
  137: MULTICALL_HANDLER, // Polygon
  143: "0xec41f75c686e376ab2a4f18bde263ab5822c4511", // Monad
  232: "0x1ed0d59019a52870337b51dee8190486a8663037", // Lens
  324: "0x68d3806e57148d6c6793c78ebddbc272fe605dbf", // zkSync Era
  480: MULTICALL_HANDLER, // World Chain
  999: "0x5e7840e06faccb6d1c3b5f5e0d1d3d07f2829bba", // HyperEVM
  1135: MULTICALL_HANDLER, // Lisk
  1868: MULTICALL_HANDLER, // Soneium
  4217: "0x7d6adcbb51ea70c134d7b0b96aa9af50fe504d90", // Tempo
  4326: "0xffc1285082deab9bf0eca5699e4930bb310afbe4", // MegaETH
  5042: "0xa07480456c4ebad7626e4fdf4a180709e238547b", // Arc
  8453: MULTICALL_HANDLER, // Base
  9745: "0x5e7840e06faccb6d1c3b5f5e0d1d3d07f2829bba", // Plasma
  34443: MULTICALL_HANDLER, // Mode
  42161: MULTICALL_HANDLER, // Arbitrum
  43114: "0x9610954acdca5ff7905f051a040ce33fe613c60e", // Avalanche
  57073: MULTICALL_HANDLER, // Ink
  59144: "0xdf1c940487574eefa79989a79a4936a0f979cda2", // Linea
  81457: MULTICALL_HANDLER, // Blast
  534352: MULTICALL_HANDLER, // Scroll
  7777777: MULTICALL_HANDLER, // Zora
};

// Mayan's Forwarder, the same address on every EVM chain.
const MAYAN_FORWARDER = "0x337685fdaB40D39bd02028545a4FfA7D287cC3E2";

// The Forwarder's logs of an order it passed on, with the names each gives the token and amount handed to the Mayan
// protocol and the order call. An order that first swaps on the sending chain is counted at what the swap gave
// (middleToken, middleAmount), the amount the Forwarder hands over. ForwardedEth, a native-token order passed on as it
// is, logs no amount and is not counted.
const MAYAN_FORWARDS = [
  { eventAbi: "event ForwardedERC20(address token, uint256 amount, address mayanProtocol, bytes protocolData)", token: "token", amount: "amount", order: "protocolData" },
  { eventAbi: "event SwapAndForwardedERC20(address tokenIn, uint256 amountIn, address swapProtocol, address middleToken, uint256 middleAmount, address mayanProtocol, bytes mayanData)", token: "middleToken", amount: "middleAmount", order: "mayanData" },
  { eventAbi: "event SwapAndForwardedEth(uint256 amountIn, address swapProtocol, address middleToken, uint256 middleAmount, address mayanProtocol, bytes mayanData)", token: "middleToken", amount: "middleAmount", order: "mayanData" },
];

// The order calls that carry a referrer and its fee in basis points, as in the swap-sdk's ABIs (above): Swift v2 and
// v1, MCTP and Fast MCTP. The Forwarder only calls protocols on Mayan's own whitelist and reverts unless the call
// succeeds, so a logged call is an order one of them took.
const MAYAN_ORDERS = new ethers.Interface([
  "function createOrderWithToken(address tokenIn, uint256 amountIn, (uint8 payloadType, bytes32 trader, bytes32 destAddr, uint16 destChainId, bytes32 referrerAddr, bytes32 tokenOut, uint64 minAmountOut, uint64 gasDrop, uint64 cancelFee, uint64 refundFee, uint64 deadline, uint8 referrerBps, uint8 auctionMode, bytes32 random) params, bytes customPayload)",
  "function createOrderWithEth((uint8 payloadType, bytes32 trader, bytes32 destAddr, uint16 destChainId, bytes32 referrerAddr, bytes32 tokenOut, uint64 minAmountOut, uint64 gasDrop, uint64 cancelFee, uint64 refundFee, uint64 deadline, uint8 referrerBps, uint8 auctionMode, bytes32 random) params, bytes customPayload)",
  "function createOrderWithToken(address tokenIn, uint256 amountIn, (bytes32 trader, bytes32 tokenOut, uint64 minAmountOut, uint64 gasDrop, uint64 cancelFee, uint64 refundFee, uint64 deadline, bytes32 destAddr, uint16 destChainId, bytes32 referrerAddr, uint8 referrerBps, uint8 auctionMode, bytes32 random) params)",
  "function createOrderWithEth((bytes32 trader, bytes32 tokenOut, uint64 minAmountOut, uint64 gasDrop, uint64 cancelFee, uint64 refundFee, uint64 deadline, bytes32 destAddr, uint16 destChainId, bytes32 referrerAddr, uint8 referrerBps, uint8 auctionMode, bytes32 random) params)",
  "function createOrder((address tokenIn, uint256 amountIn, uint64 gasDrop, bytes32 destAddr, uint16 destChain, bytes32 tokenOut, uint64 minAmountOut, uint64 deadline, uint64 redeemFee, bytes32 referrerAddr, uint8 referrerBps) params)",
  "function createOrder(address tokenIn, uint256 amountIn, uint256 circleMaxFee, uint32 destDomain, uint32 minFinalityThreshold, (uint8 payloadType, bytes32 destAddr, bytes32 tokenOut, uint64 amountOutMin, uint64 gasDrop, uint64 redeemFee, uint64 refundFee, uint64 deadline, bytes32 referrerAddr, uint8 referrerBps) orderPayload)",
  "function bridge(address tokenIn, uint256 amountIn, uint64 redeemFee, uint256 circleMaxFee, uint64 gasDrop, bytes32 destAddr, uint32 destDomain, bytes32 referrerAddress, uint8 referrerBps, uint8 payloadType, uint32 minFinalityThreshold, bytes customPayload)",
]);

// Mayan orders name the referrer as 32 bytes, an EVM address left-padded with zeros.
const MAYAN_REFERRER = ethers.zeroPadValue(FEE_WALLET, 32);

// Each chain Sweep's legs are sent from: the day the first leg counted here was sent from it, the chain's Across
// SpokePool (deployed-addresses.json, above) where Sweep's Across legs leave it, and whether Sweep's Mayan orders leave
// it too (Mayan's Forwarder is not deployed on zkSync Era and Robinhood Chain). Relay's are counted on every chain
// listed. A chain with neither Across nor Mayan has Sweep's Relay legs alone, which are known only up to the end of the
// Relay list, so it stops there (deadFrom) rather than report the days after it as zero.
type ChainConfig = { start: string; acrossSpokePool?: string; mayan?: boolean; deadFrom?: string };
const chainConfig: Record<string, ChainConfig> = {
  [CHAIN.ETHEREUM]: { start: "2026-03-14", acrossSpokePool: "0x5c7BCd6E7De5423a257D81B442095A1a6ced35C5", mayan: true },
  [CHAIN.ARBITRUM]: { start: "2026-03-10", acrossSpokePool: "0xe35e9842fceaCA96570B734083f4a58e8F7C5f2A", mayan: true },
  [CHAIN.OPTIMISM]: { start: "2026-03-10", acrossSpokePool: "0x6f26Bf09B1C792e3228e5467807a900A503c0281", mayan: true },
  [CHAIN.BASE]: { start: "2026-03-15", acrossSpokePool: "0x09aea4b2242abC8bb4BB78D537A67a245A7bEC64", mayan: true },
  [CHAIN.POLYGON]: { start: "2026-03-25", acrossSpokePool: "0x9295ee1d8C5b022Be115A2AD3c30C72E34e7F096", mayan: true },
  [CHAIN.BSC]: { start: "2026-03-15", acrossSpokePool: "0x4e8E101924eDE233C13e2D8622DC8aED2872d505", mayan: true },
  [CHAIN.LINEA]: { start: "2026-03-29", acrossSpokePool: "0x7E63A5f1a8F0B4d0934B2f2327DAED3F6bb2ee75", mayan: true },
  [CHAIN.ERA]: { start: "2026-03-18", acrossSpokePool: "0xE0B015E54d54fc84a6cB9B666099c46adE9335FF" },
  [CHAIN.ROBINHOOD]: { start: "2026-08-19", acrossSpokePool: "0xD29C85F15DF544bA632C9E25829fd29d767d7978" },
  [CHAIN.AVAX]: { start: "2026-03-29", acrossSpokePool: "0xFE9D541c92E4e90437C7152A00244886dE37a658", mayan: true },
  [CHAIN.INK]: { start: "2026-08-11", acrossSpokePool: "0xeF684C38F94F48775959ECf2012D7E864ffb9dd4" },
  [CHAIN.MODE]: { start: "2026-03-15", acrossSpokePool: "0x3baD7AD0728f9917d1Bf08af5782dCbD516cDd96" },
  [CHAIN.SCROLL]: { start: "2026-04-11", acrossSpokePool: "0x3baD7AD0728f9917d1Bf08af5782dCbD516cDd96" },
  [CHAIN.ABSTRACT]: { start: "2026-08-07", deadFrom: RELAY_LISTED_UNTIL },
  [CHAIN.BOB]: { start: "2026-08-20", deadFrom: RELAY_LISTED_UNTIL },
  [CHAIN.BERACHAIN]: { start: "2026-10-11", deadFrom: RELAY_LISTED_UNTIL },
  [CHAIN.CELO]: { start: "2026-08-07", deadFrom: RELAY_LISTED_UNTIL },
  [CHAIN.HYPERLIQUID]: { start: "2026-10-16", deadFrom: RELAY_LISTED_UNTIL },
  [CHAIN.KATANA]: { start: "2026-10-24", deadFrom: RELAY_LISTED_UNTIL },
  [CHAIN.MANTA]: { start: "2026-08-07", deadFrom: RELAY_LISTED_UNTIL },
  [CHAIN.MANTLE]: { start: "2026-08-07", deadFrom: RELAY_LISTED_UNTIL },
  [CHAIN.METIS]: { start: "2026-10-16", deadFrom: RELAY_LISTED_UNTIL },
  [CHAIN.MORPH]: { start: "2026-11-11", deadFrom: RELAY_LISTED_UNTIL },
  [CHAIN.PLUME]: { start: "2026-10-13", deadFrom: RELAY_LISTED_UNTIL },
  [CHAIN.SONEIUM]: { start: "2026-08-07", deadFrom: RELAY_LISTED_UNTIL },
  [CHAIN.SONIC]: { start: "2026-10-16", deadFrom: RELAY_LISTED_UNTIL },
  [CHAIN.XDAI]: { start: "2026-08-07", deadFrom: RELAY_LISTED_UNTIL },
  [CHAIN.ZIRCUIT]: { start: "2026-08-20", deadFrom: RELAY_LISTED_UNTIL },
  [CHAIN.ZORA]: { start: "2026-08-07", deadFrom: RELAY_LISTED_UNTIL },
};

// Where the logs indexer does not serve a call, logs are read 10,000 blocks per eth_getLogs, as bridge-aggregators/lifi
// does: an hour is ~14,400 blocks on Arbitrum, past the range many RPCs serve in one call.
const LOGS_BLOCK_RANGE = 10000;

const lastAddress = (word: string) => "0x" + String(word).slice(-40).toLowerCase();

// ethers' errors for bytes that are not the ABI encoding asked for. Other integrators' Across messages and Mayan calls
// are arbitrary bytes to this adapter, so such bytes are simply not Sweep's; any other error is thrown. ethers defers an
// error inside a nested value until that value is read, so a decoded result is checked for those (checkResultErrors)
// before it is read.
const notDecodable = (error: unknown) => ethers.isError(error, "BUFFER_OVERRUN") || ethers.isError(error, "INVALID_ARGUMENT") || ethers.isError(error, "NUMERIC_FAULT");

// Whether a transfer's calldata sends a nonzero amount to Sweep's fee wallet.
function transfersFee(callData: string): boolean {
  if (callData.length !== TRANSFER_CALLDATA_LENGTH || !callData.startsWith(ERC20_TRANSFER)) return false;
  const toWord = callData.slice(10, 74);
  return /^0{24}$/.test(toWord.slice(0, 24)) && "0x" + toWord.slice(24) === FEE_WALLET && BigInt("0x" + callData.slice(74)) > 0n;
}

// Whether an Across deposit is Sweep's: paid to the destination chain's MulticallHandler, which alone runs its message
// as Instructions, and those instructions pay Sweep's fee, a nonzero amount of the token that arrives transferred to the
// fee wallet or, where the native token arrives, a nonzero amount of it sent to the wallet with no calldata. The fee is
// paid on arrival on the other chain; volume is counted at the deposit.
function paysSweepFee(recipient: string, destinationChainId: string, message: string, outputToken: string): boolean {
  if (recipient !== ACROSS_HANDLERS[destinationChainId] || !message || message === "0x") return false;
  let instructions: ethers.Result;
  try {
    instructions = ethers.AbiCoder.defaultAbiCoder().decode(ACROSS_INSTRUCTIONS, message);
  } catch (error) {
    if (notDecodable(error)) return false;
    throw error;
  }
  if (ethers.checkResultErrors(instructions).length) return false;
  const calls: { target: string; callData: string; value: bigint }[] = instructions[0].calls;
  return calls.some(({ target, callData, value }) => {
    const to = target.toLowerCase();
    if (to === FEE_WALLET) return callData === "0x" && value > 0n;
    return to === outputToken && value === 0n && transfersFee(callData.toLowerCase());
  });
}

// Whether a forwarded Mayan call is Sweep's: one of the order calls above, naming Sweep's fee wallet as referrer with a
// nonzero referrer fee.
function namesSweepReferrer(orderCall: string): boolean {
  let order: ethers.TransactionDescription | null;
  try {
    order = MAYAN_ORDERS.parseTransaction({ data: orderCall });
  } catch (error) {
    if (notDecodable(error)) return false;
    throw error;
  }
  if (!order || ethers.checkResultErrors(order.args).length) return false;
  // The referrer and its fee are arguments of Fast MCTP's bridge and fields of the order struct in the other calls.
  const fields = order.args.params ?? order.args.orderPayload ?? order.args;
  const referrer = fields.referrerAddr ?? fields.referrerAddress;
  return referrer === MAYAN_REFERRER && fields.referrerBps > 0n;
}

const fetch = async (options: FetchOptions) => {
  const dailyBridgeVolume = options.createBalances();
  const { acrossSpokePool, mayan } = chainConfig[options.chain];

  if (acrossSpokePool) {
    const deposits = await options.getLogs({ target: acrossSpokePool, eventAbi: ACROSS_DEPOSIT, maxBlockRange: LOGS_BLOCK_RANGE });
    for (const log of deposits) {
      if (paysSweepFee(lastAddress(log.recipient), String(log.destinationChainId), String(log.message), lastAddress(log.outputToken))) dailyBridgeVolume.add(lastAddress(log.inputToken), log.inputAmount);
    }
  }

  if (mayan) {
    for (const { eventAbi, token, amount, order } of MAYAN_FORWARDS) {
      const forwards = await options.getLogs({ target: MAYAN_FORWARDER, eventAbi, maxBlockRange: LOGS_BLOCK_RANGE });
      for (const log of forwards) {
        if (namesSweepReferrer(String(log[order]))) dailyBridgeVolume.add(log[token], log[amount]);
      }
    }
  }

  const relay = relayTotals(options).crossChain[options.chain];
  if (relay) dailyBridgeVolume.addUSDValue(relay);

  return { dailyBridgeVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  adapter: chainConfig,
  methodology: {
    BridgeVolume: `Value users send to another chain through Sweep, counted on the chain it is sent from. Through Across: the input amount of every FundsDeposited log on the sending chain's SpokePool paid to Across's MulticallHandler on the receiving chain whose message, decoded as that handler's instructions, pays a nonzero fee to Sweep's fee wallet. Through Mayan: the amount handed to Mayan in every order logged by Mayan's Forwarder whose order call names Sweep's fee wallet as referrer with a nonzero referrer fee. Through Relay: the USD value sent, as Relay reports it, of every filled Relay request to another chain made for Sweep's app that pays Sweep's fee wallet an app fee, listed up to ${RELAY_LISTED_UNTIL} (the smaller of the values sent and arrived where they differ more than 2x). Not counted: Sweep's legs through Symbiosis, Across legs that pay Sweep's fee in a token other than the one bridged or that go to Robinhood Chain, Mayan orders whose call carries no referrer fee or whose amount the Forwarder does not log, and Relay requests made after ${RELAY_LISTED_UNTIL}.`,
  },
};

export default adapter;
