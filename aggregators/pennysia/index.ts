import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import ADDRESSES from "../../helpers/coreAssets.json";

// PennysiaSettlement on Ethereum Mainnet
// https://etherscan.io/address/0x3Aad97E5a91b8e43b7Dc830aCEb004307678795E
const SETTLEMENT = "0x3Aad97E5a91b8e43b7Dc830aCEb004307678795E";

// Hard-intent partner fee recipient (webapp INTENT_FEE_RECIPIENT / RELAYER_ADDRESS)
const PARTNER = "0xA9801117912b5849867378DabE8e12C725F7bf28";
// Default NEXT_PUBLIC_INTENT_FEE_BPS. Used only to invert UniswapX fee outputs
// back to quoted output volume (fee = output * bps / 10000).
const INTENT_FEE_BPS = 50n;

const COW_SETTLEMENT = "0x9008D19f58AAbD9eD0D60971565AA8510560ab41";
const VELORA_DELTA = "0x0000000000bbF5c5Fd284e657F01Bd000933C96D";
// UniswapX reactors on Ethereum (UNISWAPX_V2 quotes settle on V2; include Exclusive + V3)
const UNISWAPX_REACTORS = [
  "0x00000011F84B9aa48e5f8aA8B9897600006289Be", // V2 Dutch
  "0x6000da47483062A0D734Ba3dc7576Ce6A0B645C4", // Exclusive Dutch
  "0x0000000015757c461808EA25Eb309638B62681cf", // V3 Dutch
];

const swapExecutedEvent =
  "event SwapExecuted(address indexed recipient, address sellToken, address buyToken, uint256 amountIn, uint256 netBuy, uint256 routeIndex)";
const feeCollectedEvent =
  "event FeeCollected(address indexed token, address indexed recipient, uint256 amount)";
const transferEvent =
  "event Transfer(address indexed from, address indexed to, uint256 value)";
const cowTradeEvent =
  "event Trade(address indexed owner, address sellToken, address buyToken, uint256 sellAmount, uint256 buyAmount, uint256 feeAmount, bytes orderUid)";
const uniswapxFillEvent =
  "event Fill(bytes32 indexed orderHash, address indexed filler, address indexed swapper, uint256 nonce)";
const veloraSettledEvent =
  "event OrderSettled(address indexed owner, address indexed beneficiary, uint8 kind, address srcToken, address destToken, uint256 srcAmount, uint256 destAmount, uint256 returnAmount, uint256 protocolFee, uint256 partnerFee, bytes32 indexed orderHash)";

const SURPLUS_FEE = "Surplus Fees";
const INTENT_FEE = "Intent Fees";

const NATIVE = new Set([
  ADDRESSES.null.toLowerCase(),
  ADDRESSES.GAS_TOKEN_2.toLowerCase(),
]);

function addAmount(balances: any, token: string, amount: any, label?: string) {
  if (!token || amount == null) return;
  if (NATIVE.has(String(token).toLowerCase())) {
    balances.addGasToken(amount, label);
  } else {
    balances.add(token, amount, label);
  }
}

function padAddress(address: string) {
  return "0x" + address.slice(2).toLowerCase().padStart(64, "0");
}

function txHash(log: any): string {
  return String(log.transactionHash || log.hash || "").toLowerCase();
}

function argsOf(log: any) {
  return log.args || log;
}

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();

  const swapLogs = await options.getLogs({
    target: SETTLEMENT,
    eventAbi: swapExecutedEvent,
    // Indexer currently returns an empty set for this custom event; RPC is cheap
    // (single Settlement address, low log volume).
    skipIndexer: true,
  });
  for (const log of swapLogs) {
    addAmount(dailyVolume, log.sellToken, log.amountIn);
  }

  const feeLogs = await options.getLogs({
    target: SETTLEMENT,
    eventAbi: feeCollectedEvent,
    skipIndexer: true,
  });
  for (const log of feeLogs) {
    addAmount(dailyFees, log.token, log.amount, SURPLUS_FEE);
  }

  // Incoming ERC-20 to the Pennysia partner address tags CoW / UniswapX / Velora
  // hard intents submitted from the Pennysia app (partnerAddress + partnerFeeBps).
  // extraTopics[1] is Transfer `to`, so this is not a full-chain scan.
  const partnerTransfers = await options.getLogs({
    noTarget: true,
    eventAbi: transferEvent,
    extraTopics: [null, padAddress(PARTNER)],
    entireLog: true,
  });
  const partnerTxs = new Set(partnerTransfers.map(txHash).filter(Boolean));

  const cowTrades = await options.getLogs({
    target: COW_SETTLEMENT,
    eventAbi: cowTradeEvent,
    entireLog: true,
  });
  const cowTxs = new Set<string>();
  for (const log of cowTrades) {
    const tx = txHash(log);
    if (!partnerTxs.has(tx)) continue;
    cowTxs.add(tx);
    const a = argsOf(log);
    addAmount(dailyVolume, a.sellToken, a.sellAmount);
  }

  const veloraSettled = await options.getLogs({
    target: VELORA_DELTA,
    eventAbi: veloraSettledEvent,
    entireLog: true,
  });
  const veloraTxs = new Set<string>();
  for (const log of veloraSettled) {
    const tx = txHash(log);
    if (!partnerTxs.has(tx)) continue;
    veloraTxs.add(tx);
    const a = argsOf(log);
    addAmount(dailyVolume, a.srcToken, a.srcAmount);
  }

  const uniFills = await options.getLogs({
    targets: UNISWAPX_REACTORS,
    eventAbi: uniswapxFillEvent,
    entireLog: true,
  });
  const uniTxs = new Set(
    uniFills.map(txHash).filter((tx: string) => tx && partnerTxs.has(tx)),
  );

  for (const log of partnerTransfers) {
    const tx = txHash(log);
    const token = log.address;
    const amount = argsOf(log).value;
    if (amount == null) continue;
    if (cowTxs.has(tx) || veloraTxs.has(tx)) {
      addAmount(dailyFees, token, amount, INTENT_FEE);
    } else if (uniTxs.has(tx)) {
      addAmount(dailyFees, token, amount, INTENT_FEE);
      addAmount(dailyVolume, token, BigInt(amount) * 10000n / INTENT_FEE_BPS);
    }
  }

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  };
};

const methodology = {
  Volume:
    "Sell-token input from SwapExecuted on Pennysia Settlement (SYNC, including ETH↔WETH wrap/unwrap, and SODAX opens), plus hard-intent fills tagged by a partner-fee transfer to Pennysia's fee recipient: CoW Trade.sellAmount, Velora Delta OrderSettled.srcAmount, and UniswapX Fill output inferred as partner fee × 10000 / 50.",
  Fees:
    "Settlement FeeCollected (SYNC surplus, capped at 10% of gross, plus leftover sweeps) and hard-intent partner fees transferred to the Pennysia partner address. No surplus fee on SODAX intent opens.",
  Revenue: "Pennysia retains 100% of collected surplus, leftover sweeps, and hard-intent partner fees.",
  ProtocolRevenue: "All collected amounts go to the Settlement fee recipient or the hard-intent partner address.",
};

const breakdownMethodology = {
  Fees: {
    [SURPLUS_FEE]:
      "FeeCollected on Settlement: surplus above the quoted output (capped at 10% of gross) plus leftover token/ETH sweeps.",
    [INTENT_FEE]:
      "Partner fees on CoW, UniswapX, and Velora Delta hard intents paid to 0xA9801117912b5849867378DabE8e12C725F7bf28.",
  },
  Revenue: {
    [SURPLUS_FEE]: "Pennysia retains 100% of collected surplus and leftover sweeps.",
    [INTENT_FEE]: "Pennysia retains 100% of hard-intent partner fees.",
  },
  ProtocolRevenue: {
    [SURPLUS_FEE]: "Collected amounts are sent to the Settlement fee recipient.",
    [INTENT_FEE]: "Hard-intent partner fees are sent to the Pennysia partner address.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ETHEREUM],
  start: "2026-08-16",
  methodology,
  breakdownMethodology,
};

export default adapter;
