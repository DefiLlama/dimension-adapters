import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

/**
 * StonkBrokers — Anvil NFTFi fees / revenue / stock-dividend flow on Robinhood.
 *
 * Every NFT AMM trade and NFT-backed loan charges an ETH fee split:
 *   70% → StockBooster (buys tokenized stocks airdropped to activated brokers)
 *   30% → ProtocolFeeSink (protocol treasury)
 */
const AMM_VAULT = "0xE302733accF4800146E55fC45B46b4E4fFC032D2";
const LOAN_VAULT = "0xa7B9AC696B252B79568A5a01b2Fd02177EF23664";

const NFT_SOLD =
  "event NFTSold(address indexed seller, uint256 indexed tokenId, uint256 tokensOut, uint256 ethFeePaid, uint256 boosterShare, uint256 protocolShare)";
const NFT_BOUGHT =
  "event NFTBought(address indexed buyer, uint256 indexed tokenId, uint256 tokensIn, uint256 ethFeePaid, uint256 boosterShare, uint256 protocolShare, bool isSpecific)";
const LOAN_CREATED =
  "event LoanCreated(address indexed borrower, uint256 indexed loanId, uint256 indexed tokenId, uint256 principal, uint256 duration, uint256 ethFeePaid, uint256 boosterShare, uint256 protocolShare)";

const LABELS = {
  AMM_FEES: "NFT AMM trade fees",
  LOAN_FEES: "NFT loan fees",
  STOCK_DIVIDENDS: "StockBooster dividend funding",
  PROTOCOL_TREASURY: "Protocol fee sink",
} as const;

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();

  const [sold, bought, loans] = await Promise.all([
    options.getLogs({ target: AMM_VAULT, eventAbi: NFT_SOLD }),
    options.getLogs({ target: AMM_VAULT, eventAbi: NFT_BOUGHT }),
    options.getLogs({ target: LOAN_VAULT, eventAbi: LOAN_CREATED }),
  ]);

  for (const log of [...sold, ...bought]) {
    dailyFees.addGasToken(log.ethFeePaid, LABELS.AMM_FEES);
    dailyHoldersRevenue.addGasToken(log.boosterShare, LABELS.STOCK_DIVIDENDS);
    dailyProtocolRevenue.addGasToken(log.protocolShare, LABELS.PROTOCOL_TREASURY);
    dailyRevenue.addGasToken(log.ethFeePaid, LABELS.AMM_FEES);
  }

  for (const log of loans) {
    dailyFees.addGasToken(log.ethFeePaid, LABELS.LOAN_FEES);
    dailyHoldersRevenue.addGasToken(log.boosterShare, LABELS.STOCK_DIVIDENDS);
    dailyProtocolRevenue.addGasToken(log.protocolShare, LABELS.PROTOCOL_TREASURY);
    dailyRevenue.addGasToken(log.ethFeePaid, LABELS.LOAN_FEES);
  }

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue,
    dailyHoldersRevenue,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  adapter: {
    [CHAIN.ROBINHOOD]: { start: "2026-07-17" },
  },
  methodology: {
    Fees: "ETH fees charged on StonkBrokers NFT AMM trades (10% random / 15% snipe of ethNotionalPerNFT) and NFT-backed loans (15% APY pro-rated).",
    Revenue: "All ETH fees retained by the protocol ecosystem (StockBooster + ProtocolFeeSink).",
    ProtocolRevenue: "30% of ETH fees sent to ProtocolFeeSink.",
    HoldersRevenue: "70% of ETH fees sent to StockBooster, which buys tokenized stocks (AAPL/AMZN/NVDA) and airdrops them to activated StonkBroker TBAs.",
  },
  breakdownMethodology: {
    Fees: {
      [LABELS.AMM_FEES]: "ETH trade fees on buyRandomNFT / buySpecificNFT / sellNFT.",
      [LABELS.LOAN_FEES]: "Upfront ETH borrow fees on NFT-backed loans.",
    },
    Revenue: {
      [LABELS.AMM_FEES]: "AMM ETH fees retained by StockBooster + ProtocolFeeSink.",
      [LABELS.LOAN_FEES]: "Loan ETH fees retained by StockBooster + ProtocolFeeSink.",
    },
    ProtocolRevenue: {
      [LABELS.PROTOCOL_TREASURY]: "30% of ETH fees retained by ProtocolFeeSink.",
    },
    HoldersRevenue: {
      [LABELS.STOCK_DIVIDENDS]: "70% of ETH fees funding StockBooster stock-token dividend drops to activated brokers.",
    },
  },
};

export default adapter;
