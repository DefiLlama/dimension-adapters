import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

/**
 * StonkBrokers — Anvil NFTFi on Robinhood Chain.
 *
 * ETH fees on NFT AMM trades + NFT-backed loans:
 *   70% → StockBooster (buys AAPL/AMZN/NVDA, airdrops to activated broker TBAs)
 *   30% → ProtocolFeeSink treasury
 *
 * Activation fees (paid in $STONKBROKER) are also tracked; 50% burned / 50% protocol by default.
 */
const AMM_VAULT = "0xE302733accF4800146E55fC45B46b4E4fFC032D2";
const LOAN_VAULT = "0xa7B9AC696B252B79568A5a01b2Fd02177EF23664";
const ACTIVATION_MANAGER = "0xacD5ae3c060C1137FE2Ee86B0aB2EF697456f664";
const STONKBROKER = "0xe934e36A439C94017B64a3FecE66AF12099aBF50";

const NFT_SOLD =
  "event NFTSold(address indexed seller, uint256 indexed tokenId, uint256 tokensOut, uint256 ethFeePaid, uint256 boosterShare, uint256 protocolShare)";
const NFT_BOUGHT =
  "event NFTBought(address indexed buyer, uint256 indexed tokenId, uint256 tokensIn, uint256 ethFeePaid, uint256 boosterShare, uint256 protocolShare, bool isSpecific)";
const LOAN_CREATED =
  "event LoanCreated(address indexed borrower, uint256 indexed loanId, uint256 indexed tokenId, uint256 principal, uint256 duration, uint256 ethFeePaid, uint256 boosterShare, uint256 protocolShare)";
const ACTIVATED =
  "event Activated(uint256 indexed tokenId, address indexed owner, uint8 tier, uint256 feePaid)";
const ACTIVATION_UPGRADED =
  "event ActivationUpgraded(uint256 indexed tokenId, address indexed owner, uint8 fromTier, uint8 toTier, uint256 feePaid)";

const LABELS = {
  AMM_FEES: "NFT AMM trade fees",
  LOAN_FEES: "NFT loan fees",
  ACTIVATION_FEES: "Broker activation fees ($STONKBROKER)",
  AMM_STOCK_DIVIDENDS: "NFT AMM fees → StockBooster dividends to activated brokers",
  LOAN_STOCK_DIVIDENDS: "NFT loan fees → StockBooster dividends to activated brokers",
  AMM_PROTOCOL_TREASURY: "NFT AMM fees → ProtocolFeeSink",
  LOAN_PROTOCOL_TREASURY: "NFT loan fees → ProtocolFeeSink",
  ACTIVATION_BURN: "Activation fees burned (deflationary $STONKBROKER)",
  ACTIVATION_PROTOCOL: "Activation fees → protocol",
};

const RANDOM_FEE_BPS = 1000n;
const SPECIFIC_FEE_BPS = 1500n;
// Default ActivationManager split: 50% burn / 50% protocol
const ACTIVATION_BURN_BPS = 5000n;
const ACTIVATION_PROTOCOL_BPS = 5000n;

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();

  const [soldLogs, boughtLogs, loansLogs, activatedLogs, upgradedLogs] = await Promise.all([
    options.getLogs({ target: AMM_VAULT, eventAbi: NFT_SOLD }),
    options.getLogs({ target: AMM_VAULT, eventAbi: NFT_BOUGHT }),
    options.getLogs({ target: LOAN_VAULT, eventAbi: LOAN_CREATED }),
    options.getLogs({ target: ACTIVATION_MANAGER, eventAbi: ACTIVATED }),
    options.getLogs({ target: ACTIVATION_MANAGER, eventAbi: ACTIVATION_UPGRADED }),
  ]);

  for (const log of [...soldLogs, ...boughtLogs]) {
    const bps = log.isSpecific ? SPECIFIC_FEE_BPS : RANDOM_FEE_BPS;
    dailyVolume.addGasToken((log.ethFeePaid * 10_000n) / bps);

    dailyFees.addGasToken(log.ethFeePaid, LABELS.AMM_FEES);
    dailyHoldersRevenue.addGasToken(log.boosterShare, LABELS.AMM_STOCK_DIVIDENDS);
    dailyProtocolRevenue.addGasToken(log.protocolShare, LABELS.AMM_PROTOCOL_TREASURY);
    dailyRevenue.addGasToken(log.ethFeePaid, LABELS.AMM_FEES);
  }

  for (const log of loansLogs) {
    dailyFees.addGasToken(log.ethFeePaid, LABELS.LOAN_FEES);
    dailyHoldersRevenue.addGasToken(log.boosterShare, LABELS.LOAN_STOCK_DIVIDENDS);
    dailyProtocolRevenue.addGasToken(log.protocolShare, LABELS.LOAN_PROTOCOL_TREASURY);
    dailyRevenue.addGasToken(log.ethFeePaid, LABELS.LOAN_FEES);
  }

  for (const log of [...activatedLogs, ...upgradedLogs]) {
    const fee = BigInt(log.feePaid);
    dailyFees.addToken(STONKBROKER, fee, LABELS.ACTIVATION_FEES);
    dailyHoldersRevenue.addToken(STONKBROKER, (fee * ACTIVATION_BURN_BPS) / 10_000n, LABELS.ACTIVATION_BURN);
    dailyProtocolRevenue.addToken(STONKBROKER, (fee * ACTIVATION_PROTOCOL_BPS) / 10_000n, LABELS.ACTIVATION_PROTOCOL);
    dailyRevenue.addToken(STONKBROKER, fee, LABELS.ACTIVATION_FEES);
  }

  return {
    dailyVolume,
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
    Volume:
      "ETH notional of StonkBrokers NFT AMM fills, derived from ethFeePaid and vault fee bps (10% random / 15% snipe).",
    Fees:
      "ETH fees on NFT AMM trades + NFT-backed loans, plus $STONKBROKER broker activation/upgrade fees.",
    Revenue:
      "All collected fees: 70% of ETH fees fund stock-token dividends to activated brokers; 30% to ProtocolFeeSink. Activation fees are burned/protocol-split.",
    ProtocolRevenue:
      "30% of ETH trade/loan fees to ProtocolFeeSink, plus the protocol share of $STONKBROKER activation fees.",
    HoldersRevenue:
      "70% of ETH trade/loan fees to StockBooster (AAPL/AMZN/NVDA airdrops to activated StonkBroker TBAs), plus burned $STONKBROKER activation fees.",
  },
  breakdownMethodology: {
    Fees: {
      [LABELS.AMM_FEES]: "ETH trade fees on buyRandomNFT / buySpecificNFT / sellNFT.",
      [LABELS.LOAN_FEES]: "Upfront ETH borrow fees on NFT-backed loans.",
      [LABELS.ACTIVATION_FEES]: "One-time / upgrade $STONKBROKER activation fees.",
    },
    Revenue: {
      [LABELS.AMM_FEES]: "Full ETH AMM fee (holders + protocol split).",
      [LABELS.LOAN_FEES]: "Full ETH loan fee (holders + protocol split).",
      [LABELS.ACTIVATION_FEES]: "Full $STONKBROKER activation fee (burn + protocol).",
    },
    ProtocolRevenue: {
      [LABELS.AMM_PROTOCOL_TREASURY]: "30% of ETH AMM fees retained by ProtocolFeeSink.",
      [LABELS.LOAN_PROTOCOL_TREASURY]: "30% of ETH loan fees retained by ProtocolFeeSink.",
      [LABELS.ACTIVATION_PROTOCOL]: "Protocol share of $STONKBROKER activation fees.",
    },
    HoldersRevenue: {
      [LABELS.AMM_STOCK_DIVIDENDS]:
        "70% of ETH AMM fees → StockBooster stock-token dividend drops to activated brokers.",
      [LABELS.LOAN_STOCK_DIVIDENDS]:
        "70% of ETH loan fees → StockBooster stock-token dividend drops to activated brokers.",
      [LABELS.ACTIVATION_BURN]: "Burned share of $STONKBROKER activation fees (deflationary).",
    },
  },
};

export default adapter;
