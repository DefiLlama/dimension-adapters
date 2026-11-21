import * as sdk from "@defillama/sdk";
import ADDRESSES from "../helpers/coreAssets.json";
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

// Linea canonical bridge. ETH moves through the message services, ERC20s through the TokenBridge (which also sends
// messages, with no ETH value). The L1 claim of a withdrawal only emits MessageClaimed(messageHash), with no amount, and
// claims lag withdrawals by up to years, so withdrawals are counted when initiated on Linea, where MessageSent and BridgingInitiated 
// carry the amount. One-sided: everything is recorded on Ethereum, the Linea leg is attributed server-side (destinationChain: linea).
// https://docs.linea.build/get-started/build/contracts
const L1_MESSAGE_SERVICE = "0xd19d4B5d358258f05D7B411E21A1460D11B0876F"; // LineaRollup
const L1_TOKEN_BRIDGE = "0x051F1D88f0aF5763fB888eC4378b4D8B29ea3319";
const L2_MESSAGE_SERVICE = "0x508Ca82Df566dCD1B0DE8296e70a96332cD644ec"; // L2MessageService, on Linea
const L2_TOKEN_BRIDGE = "0x353012dc4a9A6cF55c941bADC267f82004A8ceB9"; // TokenBridge, on Linea
// USDC had its own bridge until Linea moved to native USDC (CCTP): last Deposited on 2025-03-16, then AllLockedUSDCBurnt on 2025-03-18
const L1_USDC_BRIDGE = "0x504A330327A089d8364C4ab3811Ee26976d388ce"; // L1USDCBridge
const L2_USDC_BRIDGE = "0xA2Ee6Fce4ACB62D95448729cDb781e3BEb62504A"; // L1USDCBridge.remoteUSDCBridge()
const USDC_BRIDGE_END = 1742342400; // 2025-03-19

const MESSAGE_SENT = "event MessageSent(address indexed _from, address indexed _to, uint256 _fee, uint256 _value, uint256 _nonce, bytes _calldata, bytes32 indexed _messageHash)";
// the TokenBridge emitted BridgingInitiated until its 2024-06-05 upgrade, BridgingInitiatedV2 since
const BRIDGING_INITIATED = "event BridgingInitiated(address indexed sender, address recipient, address indexed token, uint256 indexed amount)";
const BRIDGING_INITIATED_V2 = "event BridgingInitiatedV2(address indexed sender, address indexed recipient, address indexed token, uint256 amount)";
const USDC_DEPOSITED = "event Deposited(address indexed depositor, uint256 amount, address indexed to)";

const fetch = async (options: FetchOptions) => {
  const dailyOutgoingVolume = options.createBalances();
  const dailyIncomingVolume = options.createBalances();
  let dailyOutgoingTxCount = 0;
  let dailyIncomingTxCount = 0;

  // deposits: ETH sent with an L1 message (_value excludes the _fee paid to the claiming postman), and tokens locked on L1
  const l1Messages = await options.getLogs({ target: L1_MESSAGE_SERVICE, eventAbi: MESSAGE_SENT });
  for (const { _value } of l1Messages) {
    if (!BigInt(_value)) continue;
    dailyOutgoingVolume.addGasToken(_value);
    dailyOutgoingTxCount++;
  }
  for (const eventAbi of [BRIDGING_INITIATED, BRIDGING_INITIATED_V2]) {
    const deposits = await options.getLogs({ target: L1_TOKEN_BRIDGE, eventAbi });
    for (const { token, amount } of deposits) {
      dailyOutgoingVolume.add(token, amount);
      dailyOutgoingTxCount++;
    }
  }

  // withdrawals: the same events on Linea over the same window, priced as Linea tokens
  const lineaWindow = { chain: CHAIN.LINEA, fromTimestamp: options.fromTimestamp, toTimestamp: options.toTimestamp, onlyArgs: true };
  const l2Messages = await sdk.getEventLogs({ ...lineaWindow, target: L2_MESSAGE_SERVICE, eventAbi: MESSAGE_SENT });
  for (const { _value } of l2Messages) {
    if (!BigInt(_value)) continue;
    dailyIncomingVolume.addGasToken(_value);
    dailyIncomingTxCount++;
  }
  for (const eventAbi of [BRIDGING_INITIATED, BRIDGING_INITIATED_V2]) {
    const withdrawals = await sdk.getEventLogs({ ...lineaWindow, target: L2_TOKEN_BRIDGE, eventAbi });
    for (const { token, amount } of withdrawals) {
      dailyIncomingVolume.add(`${CHAIN.LINEA}:${token}`, amount, { skipChain: true });
      dailyIncomingTxCount++;
    }
  }

  if (options.fromTimestamp < USDC_BRIDGE_END) {
    const usdcDeposits = await options.getLogs({ target: L1_USDC_BRIDGE, eventAbi: USDC_DEPOSITED });
    for (const { amount } of usdcDeposits) dailyOutgoingVolume.add(ADDRESSES.ethereum.USDC, amount);
    dailyOutgoingTxCount += usdcDeposits.length;
    const usdcWithdrawals = await sdk.getEventLogs({ ...lineaWindow, target: L2_USDC_BRIDGE, eventAbi: USDC_DEPOSITED });
    for (const { amount } of usdcWithdrawals) dailyIncomingVolume.add(ADDRESSES.ethereum.USDC, amount);
    dailyIncomingTxCount += usdcWithdrawals.length;
  }

  return { dailyOutgoingVolume, dailyIncomingVolume, dailyOutgoingTxCount, dailyIncomingTxCount };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ETHEREUM],
  start: "2023-07-12", // first L1 MessageSent
  methodology: {
    OutgoingVolume: "USD value of ETH and tokens deposited from Ethereum into Linea through the canonical bridge.",
    IncomingVolume: "USD value of ETH and tokens withdrawn from Linea to Ethereum through the canonical bridge, counted when the withdrawal is initiated on Linea.",
    OutgoingTxCount: "Number of deposits from Ethereum into Linea through the canonical bridge.",
    IncomingTxCount: "Number of withdrawals from Linea to Ethereum through the canonical bridge, counted when initiated on Linea.",
  },
};

export default adapter;
