import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

// Fuel's canonical bridge, read on Ethereum only (one-sided, destination chain Fuel, attributed server-side).
// ERC20s: FuelERC20GatewayV4 Deposit (outgoing) / Withdrawal (incoming), amounts in the token's decimals.
// ETH: FuelMessagePortalV3 MessageSent (outgoing) / MessageRelayed (incoming); the uint64 amount is in Fuel's
// 9-decimal base units. Gateway transfers also send portal messages, with amount 0, so only non-zero amounts are ETH.
const GATEWAY = "0xa4cA04d02bfdC3A2DF56B9b6994520E69dF43F67";
const PORTAL = "0xAEB0c00D0125A8a788956ade4f4F12Ead9f65DDf";
const FUEL_TO_WEI = 10n ** 9n;

const DEPOSIT = "event Deposit(bytes32 indexed sender, address indexed tokenAddress, uint256 amount)";
const WITHDRAWAL = "event Withdrawal(bytes32 indexed recipient, address indexed tokenAddress, uint256 amount)";
const MESSAGE_SENT = "event MessageSent(bytes32 indexed sender, bytes32 indexed recipient, uint256 indexed nonce, uint64 amount, bytes data)";
const MESSAGE_RELAYED = "event MessageRelayed(bytes32 indexed messageId, bytes32 indexed sender, bytes32 indexed recipient, uint64 amount)";

const fetch = async (options: FetchOptions) => {
  const dailyOutgoingVolume = options.createBalances();
  const dailyIncomingVolume = options.createBalances();

  const deposits = await options.getLogs({ target: GATEWAY, eventAbi: DEPOSIT });
  const withdrawals = await options.getLogs({ target: GATEWAY, eventAbi: WITHDRAWAL });
  const ethSent = (await options.getLogs({ target: PORTAL, eventAbi: MESSAGE_SENT })).filter((l: any) => BigInt(l.amount) > 0n);
  const ethRelayed = (await options.getLogs({ target: PORTAL, eventAbi: MESSAGE_RELAYED })).filter((l: any) => BigInt(l.amount) > 0n);

  for (const l of deposits) dailyOutgoingVolume.add(l.tokenAddress, l.amount);
  for (const l of withdrawals) dailyIncomingVolume.add(l.tokenAddress, l.amount);
  for (const l of ethSent) dailyOutgoingVolume.addGasToken(BigInt(l.amount) * FUEL_TO_WEI);
  for (const l of ethRelayed) dailyIncomingVolume.addGasToken(BigInt(l.amount) * FUEL_TO_WEI);

  return {
    dailyOutgoingVolume,
    dailyIncomingVolume,
    dailyOutgoingTxCount: deposits.length + ethSent.length,
    dailyIncomingTxCount: withdrawals.length + ethRelayed.length,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ETHEREUM],
  methodology: {
    OutgoingVolume: "Value of ETH and tokens deposited on Ethereum into Fuel's canonical bridge.",
    IncomingVolume: "Value of ETH and tokens withdrawn on Ethereum from Fuel's canonical bridge.",
    OutgoingTxCount: "Number of deposits to Fuel on Ethereum.",
    IncomingTxCount: "Number of withdrawals from Fuel on Ethereum.",
  },
};

export default adapter;
