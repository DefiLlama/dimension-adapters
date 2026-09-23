import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import ADDRESSES from "../../helpers/coreAssets.json";

type Balances = ReturnType<FetchOptions["createBalances"]>;

const ZERO = ADDRESSES.null;
// ETH quoted desks report the zero address as their quote token.
const addQuote = (balances: Balances, quote: string, amount: bigint, label?: string) => {
  if (amount <= 0n) return;
  if (quote.toLowerCase() === ZERO) balances.addGasToken(amount, label);
  else balances.addToken(quote, amount, label);
};

/**
 * StonkBrokers Anvil 2 way desks (InternExchange) - permissionless NFT desks
 * on Robinhood Chain and Ethereum (live 2026-09-22). A creator stakes quote
 * tokens (bids), NFTs (asks) or both onto a linear / exponential price ladder
 * for any ERC-721 collection; traders buy off the asks and sell into the bids.
 *
 * Every fill pays a 9.99% protocol fee in the desk's quote token, routed by the
 * exchange in the same tx (FeeRouted): 66% to the desk that filled (staked
 * liquidity), 25% to the Stonk Interns Clock In engine (dividends to activated
 * intern holders) and 9% to the treasury. Volume is the curve notional of each
 * fill: Buy.paid net of the fee, Sell.received grossed up by the fee.
 */
const EXCHANGE: Record<string, string> = {
  [CHAIN.ROBINHOOD]: "0xDea32D8AEE85B41A0f320Ff823e4625AAB01f518",
  [CHAIN.ETHEREUM]: "0xE272B47AF5d8de38E7D09c048a81480290478193",
};

const FEE_ROUTED =
  "event FeeRouted(address indexed quote, address indexed pool, uint256 toDesk, uint256 toEngine, uint256 toTreasury)";
const BUY = "event Buy(address indexed trader, address indexed pool, uint256 count, uint256 paid, uint256 protocolFee)";
const SELL = "event Sell(address indexed trader, address indexed pool, uint256 count, uint256 received, uint256 protocolFee)";

const LABELS = {
  DESK_FEES: "Anvil 2 way desk trade fees (9.99% of every fill)",
  DESK_SHARE: "Fee share paid to the desk that filled (66%)",
  INTERN_DIVIDENDS: "Fee share to the Stonk Interns Clock In engine (25%)",
  TREASURY: "Fee share to the treasury (9%)",
};

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();

  const target = EXCHANGE[options.chain];
  const [feeLogs, buyLogs, sellLogs] = await Promise.all([
    options.getLogs({ target, eventAbi: FEE_ROUTED }),
    options.getLogs({ target, eventAbi: BUY }),
    options.getLogs({ target, eventAbi: SELL }),
  ]);

  // quote token per desk: FeeRouted carries it, and every fill routes a fee.
  const quoteOfPool = new Map<string, string>();
  for (const log of feeLogs) quoteOfPool.set(String(log.pool).toLowerCase(), String(log.quote));
  const missing = [...new Set([...buyLogs, ...sellLogs].map((l) => String(l.pool).toLowerCase()))].filter((p) => !quoteOfPool.has(p));
  if (missing.length) {
    const quotes: string[] = await options.api.multiCall({ abi: "address:quote", calls: missing, permitFailure: true });
    missing.forEach((p, i) => {
      if (quotes[i]) quoteOfPool.set(p, quotes[i]);
    });
  }

  for (const log of feeLogs) {
    const quote = String(log.quote);
    const toDesk = BigInt(log.toDesk);
    const toEngine = BigInt(log.toEngine);
    const toTreasury = BigInt(log.toTreasury);
    addQuote(dailyFees, quote, toDesk + toEngine + toTreasury, LABELS.DESK_FEES);
    addQuote(dailySupplySideRevenue, quote, toDesk, LABELS.DESK_SHARE);
    addQuote(dailyHoldersRevenue, quote, toEngine, LABELS.INTERN_DIVIDENDS);
    addQuote(dailyProtocolRevenue, quote, toTreasury, LABELS.TREASURY);
    addQuote(dailyRevenue, quote, toEngine, LABELS.INTERN_DIVIDENDS);
    addQuote(dailyRevenue, quote, toTreasury, LABELS.TREASURY);
  }

  for (const log of buyLogs) {
    const quote = quoteOfPool.get(String(log.pool).toLowerCase());
    if (!quote) continue;
    addQuote(dailyVolume, quote, BigInt(log.paid) - BigInt(log.protocolFee));
  }
  for (const log of sellLogs) {
    const quote = quoteOfPool.get(String(log.pool).toLowerCase());
    if (!quote) continue;
    addQuote(dailyVolume, quote, BigInt(log.received) + BigInt(log.protocolFee));
  }

  return { dailyVolume, dailyFees, dailyRevenue, dailyProtocolRevenue, dailySupplySideRevenue, dailyHoldersRevenue };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ROBINHOOD, CHAIN.ETHEREUM],
  start: "2026-09-22",
  methodology: {
    Volume: "Curve notional of every NFT fill on the Anvil 2 way desks: Buy.paid net of the protocol fee plus Sell.received grossed up by it, in each desk's quote token.",
    Fees: "The 9.99% fee charged in the quote token on every desk fill (InternExchange FeeRouted toDesk + toEngine + toTreasury).",
    Revenue: "The 25% Stonk Interns Clock In engine share plus the 9% treasury share of the fee.",
    ProtocolRevenue: "The 9% treasury share of the fee.",
    HoldersRevenue: "The 25% share routed to the Stonk Interns Clock In engine, distributed as dividends to activated intern holders.",
    SupplySideRevenue: "The 66% share paid to the desk whose staked liquidity filled the trade.",
  },
  breakdownMethodology: {
    Fees: {
      [LABELS.DESK_FEES]: "9.99% of every buy and sell on an Anvil 2 way desk, paid in the desk's quote token.",
    },
    Revenue: {
      [LABELS.INTERN_DIVIDENDS]: "25% of desk fees ? Stonk Interns Clock In engine.",
      [LABELS.TREASURY]: "9% of desk fees ? treasury.",
    },
    ProtocolRevenue: {
      [LABELS.TREASURY]: "9% of desk fees ? treasury.",
    },
    HoldersRevenue: {
      [LABELS.INTERN_DIVIDENDS]: "25% of desk fees ? Stonk Interns Clock In engine dividends to activated intern holders.",
    },
    SupplySideRevenue: {
      [LABELS.DESK_SHARE]: "66% of desk fees ? the desk (staked liquidity) that filled the trade.",
    },
  },
};

export default adapter;
