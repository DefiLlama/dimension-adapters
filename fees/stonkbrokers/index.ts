import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

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
  AMM_STOCK_DIVIDENDS: "NFT AMM fees to StockBooster for dividend funding",
  LOAN_STOCK_DIVIDENDS: "NFT loan fees to StockBooster for dividend funding",
  AMM_PROTOCOL_TREASURY: "NFT AMM fees to Protocol fee sink",
  LOAN_PROTOCOL_TREASURY: "NFT loan fees to Protocol fee sink",
}

const RANDOM_FEE_BPS = 1000n;
const SPECIFIC_FEE_BPS = 1500n;

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const soldLogs = await options.getLogs({ target: AMM_VAULT, eventAbi: NFT_SOLD });
  const boughtLogs = await options.getLogs({ target: AMM_VAULT, eventAbi: NFT_BOUGHT });
  const loansLogs = await options.getLogs({ target: LOAN_VAULT, eventAbi: LOAN_CREATED });

  for (const log of [...soldLogs, ...boughtLogs]) {
    const bps = log.isSpecific ? SPECIFIC_FEE_BPS : RANDOM_FEE_BPS;
    dailyVolume.addGasToken((log.ethFeePaid * 10_000n) / bps);

    dailyFees.addGasToken(log.ethFeePaid, LABELS.AMM_FEES);
    dailySupplySideRevenue.addGasToken(log.boosterShare, LABELS.AMM_STOCK_DIVIDENDS);
    dailyProtocolRevenue.addGasToken(log.protocolShare, LABELS.AMM_PROTOCOL_TREASURY);
    dailyRevenue.addGasToken(log.protocolShare, LABELS.AMM_PROTOCOL_TREASURY);
  }

  for (const log of loansLogs) {
    dailyFees.addGasToken(log.ethFeePaid, LABELS.LOAN_FEES);
    dailySupplySideRevenue.addGasToken(log.boosterShare, LABELS.LOAN_STOCK_DIVIDENDS);
    dailyProtocolRevenue.addGasToken(log.protocolShare, LABELS.LOAN_PROTOCOL_TREASURY);
    dailyRevenue.addGasToken(log.protocolShare, LABELS.LOAN_PROTOCOL_TREASURY);
  }

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue,
    dailySupplySideRevenue,
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
    Volume: "ETH notional of StonkBrokers NFT AMM fills, derived from ethFeePaid and the vault fee bps (10% random / 15% snipe).",
    Fees: "ETH fees charged on StonkBrokers NFT AMM trades (10% random / 15% snipe of ethNotionalPerNFT) and NFT-backed loans (15% APY pro-rated).",
    Revenue: "30% of ETH fees (NFT AMM trades + NFT-backed loans) sent to ProtocolFeeSink..",
    ProtocolRevenue: "30% of ETH fees (NFT AMM trades + NFT-backed loans) sent to ProtocolFeeSink.",
    SupplySideRevenue: "70% of ETH fees (NFT AMM trades + NFT-backed loans) sent to StockBooster, which buys tokenized stocks (AAPL/AMZN/NVDA) and airdrops them to activated StonkBroker TBAs.",
  },
  breakdownMethodology: {
    Fees: {
      [LABELS.AMM_FEES]: "ETH trade fees on buyRandomNFT / buySpecificNFT / sellNFT.",
      [LABELS.LOAN_FEES]: "Upfront ETH borrow fees on NFT-backed loans.",
    },
    Revenue: {
      [LABELS.AMM_PROTOCOL_TREASURY]: "30% of ETH fees (NFT AMM trades) sent to ProtocolFeeSink.",
      [LABELS.LOAN_PROTOCOL_TREASURY]: "30% of ETH fees (NFT-backed loans) sent to ProtocolFeeSink.",
    },
    ProtocolRevenue: {
      [LABELS.AMM_PROTOCOL_TREASURY]: "30% of ETH fees (NFT AMM trades) retained by ProtocolFeeSink.",
      [LABELS.LOAN_PROTOCOL_TREASURY]: "30% of ETH fees (NFT-backed loans) retained by ProtocolFeeSink.",
    },
    SupplySideRevenue: {
      [LABELS.AMM_STOCK_DIVIDENDS]: "70% of ETH fees (NFT AMM trades) funding StockBooster stock-token dividend drops to activated brokers.",
      [LABELS.LOAN_STOCK_DIVIDENDS]: "70% of ETH fees (NFT-backed loans) funding StockBooster stock-token dividend drops to activated brokers.",
    },
  },
};

export default adapter;
