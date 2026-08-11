import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

// AxiumPass is non-custodial recurring stablecoin subscription infrastructure
// (https://axiumpass.com). A subscriber approves an ERC-20 allowance once and
// creates a subscription in a SubscriptionVault; each billing period the
// keeper (or the subscriber themself) calls processSubscription, which pulls
// the payment and forwards 100% of it directly to the merchant in the same
// transaction — the vault never holds funds and takes no on-chain fee, so
// there is no fees/revenue dimension to report (same situation as LlamaPay).
//
// We report as payment volume the value settled to merchants, summed on-chain
// from SubscriptionProcessed events. The event has the same signature on both
// vault generations, so v1 and v2 are queried in a single getLogs call:
//   SubscriptionProcessed(id, subscriber, recipient, token, amount, timestamp)
// `amount` is in the token's native decimals (USDC/USDT/EURC), so it can be
// summed directly via Balances.add(token, amount).
//
// All vault sources are verified on each chain's explorer; the public mirror
// is https://github.com/Kais769/axiumpass-contracts.
// v1 shares one address on Polygon/Arbitrum/Optimism (same deployer wallet,
// same CREATE nonce); Base was deployed at a different nonce.

const chainConfig: Record<string, { vaults: string[]; start: string }> = {
  [CHAIN.POLYGON]: {
    vaults: [
      "0x72ddc27e44FD5F8dCfb494317241c4e60575eEd3", // SubscriptionVault v1
      "0xe9234C7706a7b15A20947fCBd8390c808c523646", // SubscriptionVault4337 v2 (Jul 2026)
    ],
    start: "2026-06-10", // conservative lower bound: v1 vault deployed mid-June 2026
  },
  [CHAIN.BASE]: {
    vaults: [
      "0x162c5212C224137033919c6EE23Aee6A80a8bB78", // SubscriptionVault v1
      "0x6Ed0049DD3F8d6eb24f81fc1ad9978D50cd1D7d8", // SubscriptionVault4337 v2 (Jul 2026)
    ],
    start: "2026-07-05", // v1 vault deployment day on Base
  },
  [CHAIN.ARBITRUM]: {
    vaults: [
      "0x72ddc27e44FD5F8dCfb494317241c4e60575eEd3", // SubscriptionVault v1
      "0x1dd00Dfb68773d2043e24A0Ebb6EAdC2e6Ab1953", // SubscriptionVault4337 v2 (Jul 2026)
    ],
    start: "2026-07-06", // v1 vault deployment day on Arbitrum
  },
  [CHAIN.OPTIMISM]: {
    vaults: [
      "0x72ddc27e44FD5F8dCfb494317241c4e60575eEd3", // SubscriptionVault v1
      "0x1dd00Dfb68773d2043e24A0Ebb6EAdC2e6Ab1953", // SubscriptionVault4337 v2 (Jul 2026)
    ],
    start: "2026-07-06", // v1 vault deployment day on Optimism
  },
};

const SubscriptionProcessedEvent =
  "event SubscriptionProcessed(uint256 indexed id, address indexed subscriber, address indexed recipient, address token, uint256 amount, uint256 timestamp)";

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();

  const logs = await options.getLogs({
    targets: chainConfig[options.chain].vaults,
    eventAbi: SubscriptionProcessedEvent,
  });
  for (const log of logs) {
    dailyVolume.add(log.token, log.amount);
  }

  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  methodology: {
    Volume:
      "Recurring subscription payments settled to merchants, summed on-chain from SubscriptionProcessed events of the AxiumPass SubscriptionVault contracts (v1 and v2) on each chain. Each event's amount is the stablecoin value (USDC/USDT/EURC, native decimals) pulled from the subscriber and forwarded 100% to the merchant in the same transaction. The vaults are non-custodial and charge no on-chain fee, so no fees/revenue is reported.",
  },
  adapter: chainConfig,
  fetch,
};

export default adapter;
