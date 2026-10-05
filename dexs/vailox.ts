import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

// Vailox is a P2P crypto <-> fiat marketplace. The seller locks stablecoins in the VailoxEscrow contract and the
// escrow is released to the buyer (EscrowComplete) once the fiat payment is confirmed. Volume is the escrowed
// stablecoin amount of each completed trade; the fiat leg settles off-chain and is not counted again, and cancelled or
// refunded escrows move no volume.
// Verified source: https://sourcify.dev/server/v2/contract/137/0x8Da513d9B614D0a473eAf294E3e531Cd4EEa9984?fields=sources
// Same CREATE2 address on every EVM chain. Fees are tracked in fees/vailox.ts from the same event.
// Tron escrow (TKTF8R8bak9oN1tDch6CFVyMWSakfRRZLK) is deployed but has no trades yet, so it is not listed here.
const ESCROW = "0x8Da513d9B614D0a473eAf294E3e531Cd4EEa9984";

const ESCROW_COMPLETE_EVENT =
  "event EscrowComplete(uint256 indexed orderId, (address sender, address receiver, uint256 value, uint256 receiverFee, uint256 senderFee, address currency, uint8 status, uint64 created, bool isSenderMerchant, bool isReceiverMerchant, uint64 escrowTimeProcess) escrow)";

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const logs = await options.getLogs({ target: ESCROW, eventAbi: ESCROW_COMPLETE_EVENT });
  for (const { escrow } of logs) dailyVolume.add(escrow.currency, escrow.value);
  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ETHEREUM, CHAIN.POLYGON, CHAIN.ARBITRUM, CHAIN.BASE, CHAIN.BSC],
  start: "2025-12-20",
  methodology: {
    Volume: "Stablecoin amount of every completed P2P trade, read from the VailoxEscrow EscrowComplete events. Each trade is counted once (the off-chain fiat leg is not added) and cancelled or refunded trades are excluded.",
  },
};

export default adapter;
