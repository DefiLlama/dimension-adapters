import { FetchOptions, ProtocolType, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";

// STRATO (BlockApps Mercata) prices transactions as a flat $0.01 USDST per
// transaction instead of a gas market: eth_getBlockByNumber reports gasPrice 0
// on every transaction, so gasUsed * gasPrice is always 0 and the usual
// receipt-based chain fee helpers cannot be used here.
//
// The charge is made by FeeRouter.payFees(), installed at the Decider
// (0xDEC1DE) and DELEGATECALLed by the node for every transaction:
// https://github.com/blockapps/strato-platform app/contracts/concrete/Staking/FeeRouter.sol
//   uint usdstFee = 1e16;                                  // $0.01
//   proposerShare = usdstFee * staking.proposerFeeBps() / 10000;
//   USDST.transfer(feeCollector, usdstFee - proposerShare); // protocol treasury
//   USDST.transfer(staking, proposerShare);                 // block proposer + delegators
// A transaction that burns a Voucher (10 are granted per bridge-in) pays
// nothing and emits no fee transfer, so voucher-paid transactions correctly
// contribute no fees.
const USDST = "0x937efa7e3a77e20bbdbd7c0d32b6514f368c1010";

// Both sinks are genesis constants: FeeCollector at 0x100d (strato-platform
// strato/core/strato-genesis/src/Blockchain/GenesisBlocks/HeliumGenesisBlock.hs
// `feeCollectorAddress = 0x100d`) and the live StratoStaking deployment that
// FeeRouter credits the proposer share to.
const FEE_COLLECTOR = "0x000000000000000000000000000000000000100d";
const STAKING = "0xf30a022ce83bed7adeafc286c719388dcc3b3988";

// FeeRouter.payFees `usdstFee`. proposerFeeBps() does not resolve on the
// current mainnet governance deployment, so today the whole 0.01 USDST lands
// on the FeeCollector and nothing reaches the staking contract; the per
// transaction split below handles both cases without a code change.
const TX_FEE = 10n ** 16n;

const TRANSFER_EVENT = "event Transfer(address indexed from, address indexed to, uint256 value)";

// noderpc.strato.nexus rejects an eth_getLogs range once it matches more than
// 1000 events ("use smaller ranges or narrower filters"), so the window is
// walked in fixed chunks rather than in one call. The busiest 200-block window
// measured over a full day held 292 USDST transfers, leaving ~3x headroom, and
// an hour of STRATO blocks is ~470 blocks, so an hourly run makes 2-3 calls.
const MAX_BLOCK_RANGE = 200;

// The chain's own transaction fee is the only thing this adapter counts. The
// FeeCollector is a shared sink: CDP stability fees and the AMM's protocol cut
// also land there, and those belong to the STRATO protocol adapter, not to the
// chain. They are separated the way the node charges the fee - payFees() runs
// before the transaction body, so within a transaction the leading transfers
// into the fee sinks are the ones that add up to exactly usdstFee. Anything
// after that prefix is an application fee and is dropped here.
const getTransactionFeeLegs = (logs: any[]): { to: string; value: bigint }[] => {
  const byTransaction = new Map<string, { logIndex: number; to: string; value: bigint }[]>();

  for (const log of logs) {
    const to = log.args.to.toLowerCase();
    if (to !== FEE_COLLECTOR && to !== STAKING) continue;
    const transactionHash = log.transactionHash.toLowerCase();
    if (!byTransaction.has(transactionHash)) byTransaction.set(transactionHash, []);
    byTransaction.get(transactionHash)!.push({
      logIndex: Number(log.logIndex ?? log.index),
      to,
      value: BigInt(log.args.value),
    });
  }

  const legs: { to: string; value: bigint }[] = [];

  for (const transfers of byTransaction.values()) {
    transfers.sort((a, b) => a.logIndex - b.logIndex);
    const prefix: { to: string; value: bigint }[] = [];
    let sum = 0n;
    for (const transfer of transfers) {
      if (sum >= TX_FEE) break;
      prefix.push(transfer);
      sum += transfer.value;
    }
    // Only an exact match is the transaction fee. A voucher-paid transaction
    // has no fee leg at all, and its application fees must not be mistaken for
    // one.
    if (sum === TX_FEE) legs.push(...prefix);
  }

  return legs;
};

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const fromBlock = await options.getFromBlock();
  const toBlock = await options.getToBlock();

  const logs: any[] = [];
  for (let chunkFrom = fromBlock; chunkFrom <= toBlock; chunkFrom += MAX_BLOCK_RANGE) {
    const chunkTo = Math.min(chunkFrom + MAX_BLOCK_RANGE - 1, toBlock);
    logs.push(...await options.getLogs({
      targets: [USDST],
      eventAbi: TRANSFER_EVENT,
      onlyArgs: false,
      fromBlock: chunkFrom,
      toBlock: chunkTo,
    }));
  }

  for (const { to, value } of getTransactionFeeLegs(logs)) {
    dailyFees.add(USDST, value, METRIC.TRANSACTION_GAS_FEES);
    if (to === STAKING) {
      dailySupplySideRevenue.add(USDST, value, "Transaction Fees To Validators");
    } else {
      dailyRevenue.add(USDST, value, "Transaction Fees To Treasury");
    }
  }

  return { dailyFees, dailyRevenue, dailySupplySideRevenue, dailyProtocolRevenue: dailyRevenue.clone() };
};

const methodology = {
  Fees: "Flat $0.01 USDST charged on every STRATO transaction. Transactions paid with a Voucher credit are free and are not counted. Excludes application fees earned by the protocols running on STRATO (CDP stability fees, AMM swap fees, lending interest), which are tracked under the STRATO protocol listing.",
  Revenue: "Share of the transaction fee kept by the chain's FeeCollector treasury. This is the whole fee today, because the block proposer share is configured at 0 basis points.",
  SupplySideRevenue: "Share of the transaction fee paid to the block proposer's operator and its delegators through the StratoStaking contract. 0 basis points today.",
  ProtocolRevenue: "Share of the transaction fee kept by the chain's FeeCollector treasury.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.TRANSACTION_GAS_FEES]: "Flat $0.01 USDST per non-voucher transaction, charged by FeeRouter.payFees().",
  },
  Revenue: {
    "Transaction Fees To Treasury": "Portion of each transaction fee transferred to the genesis FeeCollector (0x100d).",
  },
  SupplySideRevenue: {
    "Transaction Fees To Validators": "Portion of each transaction fee transferred to StratoStaking for the block proposer and its delegators.",
  },
  ProtocolRevenue: {
    "Transaction Fees To Treasury": "Portion of each transaction fee transferred to the genesis FeeCollector (0x100d).",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.STRATO],
  // The chain has charged this fee since genesis (2025-10-30, block 10), but
  // coins.llama.fi only prices USDST from 2026-05-27, and every fee on STRATO
  // is denominated in USDST. Starting earlier would store $0 rows for days
  // that did have real fees. Move this back to 2025-10-30 if USDST pricing is
  // ever backfilled to genesis.
  start: '2026-05-27',
  protocolType: ProtocolType.CHAIN,
  methodology,
  breakdownMethodology,
};

export default adapter;
