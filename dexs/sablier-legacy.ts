import type { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

// Sablier Legacy (V1): the original pre-funded ERC20 money-streaming protocol,
// predating the modern Lockup and Flow products. Volume is the value paid out to
// recipients on chain: WithdrawFromStream amounts only. Cancellations are excluded.
//
// The legacy Withdraw event carries the amount but not the stream token, so each
// withdrawal's token is resolved from the ERC20 Transfer the contract emits to the
// recipient in the same transaction (matched on tx hash + recipient + amount).
// Neither the V1 subgraph (The Graph hosted service, shut down) nor Sablier's Envio
// HyperIndex (Lockup/Flow only) index legacy actions, so this reads on-chain logs.

// Sablier v1 mainnet deployments. Addresses from the official
// sablier-labs/legacy-subgraph (networks/mainnet.json); both verifiable on Etherscan.
const CONTRACTS = [
  "0xA4fc358455Febe425536fd1878bE67FfDBDEC59a", // Sablier v1.0.0
  "0xCD18eAa163733Da39c232722cBC4E8940b1D8888", // Sablier v1.1.0
];

const WITHDRAW_EVENT =
  "event WithdrawFromStream(uint256 indexed streamId, address indexed recipient, uint256 amount)";
const TRANSFER_EVENT =
  "event Transfer(address indexed from, address indexed to, uint256 value)";
// keccak256("Transfer(address,address,uint256)"), the ERC20 Transfer signature hash
const TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

const padAddress = (address: string) =>
  "0x" + address.slice(2).toLowerCase().padStart(64, "0");

const settlementKey = (
  txHash: string,
  recipient: string,
  amount: bigint | string
) => `${txHash.toLowerCase()}-${recipient.toLowerCase()}-${amount.toString()}`;

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();

  for (const target of CONTRACTS) {
    const [withdraws, transfers] = await Promise.all([
      options.getLogs({ target, eventAbi: WITHDRAW_EVENT, onlyArgs: false }),
      // The Withdraw event does not include the stream token, so pull the ERC20
      // Transfers the contract emitted (topic-filtered to from = this contract)
      // and match them to withdrawals by tx + recipient + amount. This stays
      // within the query block window; deriving the token from CreateStream
      // instead would need a full-history scan each run, since legacy streams are
      // created long before any given withdrawal window. Same noTarget pattern as
      // dexs/uniswap-v1.ts.
      options.getLogs({
        noTarget: true,
        eventAbi: TRANSFER_EVENT,
        topics: [TRANSFER_TOPIC, padAddress(target)],
        onlyArgs: false,
      }),
    ]);

    // WithdrawFromStream settlements counted per (tx, recipient, amount). Using a
    // counter rather than a set means each withdrawal authorizes at most one
    // matching Transfer, so a batched tx sharing the same to+value cannot be
    // counted twice.
    const recipientSettlements = new Map<string, number>();
    const recordSettlement = (key: string) =>
      recipientSettlements.set(key, (recipientSettlements.get(key) ?? 0) + 1);
    for (const log of withdraws) {
      const { recipient, amount } = log.args;
      recordSettlement(settlementKey(log.transactionHash, recipient, amount));
    }

    // Resolve each withdrawal's token (the Transfer emitter) and amount from the
    // ERC20 Transfer the contract sent to the recipient in the same transaction,
    // consuming one withdrawal per matched Transfer.
    for (const log of transfers) {
      const { to, value } = log.args;
      const key = settlementKey(log.transactionHash, to, value);
      const remaining = recipientSettlements.get(key) ?? 0;
      if (remaining > 0) {
        recipientSettlements.set(key, remaining - 1);
        dailyVolume.add(log.address, value);
      }
    }
  }

  return { dailyVolume };
};

const CONFIG: Record<string, { start: string }> = {
  [CHAIN.ETHEREUM]: { start: "2019-09-26" },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  methodology: {
    Volume:
      "Value paid out to Sablier Legacy (V1) stream recipients on Ethereum: WithdrawFromStream amounts (cancellations excluded). Each withdrawal's token is resolved from the ERC20 Transfer emitted to the recipient in the same transaction.",
  },
  adapter: CONFIG,
  fetch,
};

export default adapter;
