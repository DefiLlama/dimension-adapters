import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import ADDRESSES from "../../helpers/coreAssets.json";
import { addTokensReceived } from "../../helpers/token";
import { STONKBROKER } from "../stonkbrokers/helpers";

/**
 * StonkBrokers Anvil NFTFi — the broker NFT economy on Robinhood Chain, plus
 * the Relay swap-desk fee rail on Base.
 *
 * Fee sources:
 * 1. NFT AMM trades + NFT-backed loans (70% StockBooster / 30% ProtocolFeeSink)
 * 2. Broker activation fees in $STONKBROKER (50% burn / 50% protocol)
 * 3. Stonk Interns (mint opened 2026-09-19): mint fee = $20 in ETH (25%
 *    intern Clock In payroll / 75% protocol treasury) plus a $STONKBROKER leg
 *    (100% treasury), a flat $1 ETH promotion fee on every intern pay-share
 *    raise (100% treasury), and intern activation fees in $STONKBROKER on the
 *    same 50% burn / 50% protocol split. The 9.99% ERC-2981 royalty on
 *    secondary sales accrues to the payroll wallet and is not yet flushed, so
 *    it is not booked until it moves.
 * 4. Swap-desk 1% Relay app fee: Base USDC forwarded from the fee wallet
 *    (claimed from Relay, then bridged to StockBooster as ETH)
 *
 * Volume: NFT AMM notional (ethFeePaid ÷ fee bps) and Stonk Interns mint
 * releases (DormantReleased.ethPaid, the $20 ETH leg).
 */

const AMM_VAULT = "0xE302733accF4800146E55fC45B46b4E4fFC032D2";
const LOAN_VAULT = "0xa7B9AC696B252B79568A5a01b2Fd02177EF23664";
const ACTIVATION_MANAGER = "0xacD5ae3c060C1137FE2Ee86B0aB2EF697456f664";

// Stonk Interns (mint opened 2026-09-19, deploy block 66,628,699). The
// collection splits the ETH leg of every paid release (MINT_ENGINE_BPS =
// 2500 to the payroll wallet, the rest to the fees treasury) and forwards
// the STONK leg plus the $1 promotion fee entirely to the treasury. The
// InternActivationManager burns half of each activation fee and forwards
// the other half to the same fees treasury.
const INTERNS_COLLECTION = "0xFc4b0c4F464dC3037cF013934648a8A726d565A5";
const INTERNS_ACTIVATION = "0x668Ea9E44e0cEb5B203067873e0b9bcdF2214b37";
// StonkInterns.treasury() — an immutable, so pinned here instead of read.
const INTERNS_TREASURY = "0xD2671d2Bdc84CF76E97ADb0fD7bb2B54F24CBDe8";
const INTERNS_MINT_ENGINE_BPS = 2500n;

// Relay swap-desk 1% app fee accrues off-chain, is claimed as Base USDC to the
// treasury fee wallet, then forwarded via Relay to StockBooster as ETH.
const RELAY_FEE_WALLET = "0xb668382cF44038a3E8140E789060F6A809787CDa";
const BASE_USDC = ADDRESSES.base.USDC;

const NFT_SOLD =
  "event NFTSold(address indexed seller, uint256 indexed tokenId, uint256 tokensOut, uint256 ethFeePaid, uint256 boosterShare, uint256 protocolShare)";
const NFT_BOUGHT =
  "event NFTBought(address indexed buyer, uint256 indexed tokenId, uint256 tokensIn, uint256 ethFeePaid, uint256 boosterShare, uint256 protocolShare, bool isSpecific)";
const LOAN_CREATED =
  "event LoanCreated(address indexed borrower, uint256 indexed loanId, uint256 indexed tokenId, uint256 principal, uint256 duration, uint256 ethFeePaid, uint256 boosterShare, uint256 protocolShare)";
const ACTIVATED = "event Activated(uint256 indexed tokenId, address indexed owner, uint8 tier, uint256 feePaid)";
const ACTIVATION_UPGRADED =
  "event ActivationUpgraded(uint256 indexed tokenId, address indexed owner, uint8 fromTier, uint8 toTier, uint256 feePaid)";
// Stonk Interns: a paid release flips one dormant intern out of its parent
// broker's token-bound wallet. ethPaid is the $20 ETH leg; stonkPaid is the
// $STONKBROKER leg (both forwarded inside the same transaction).
const INTERN_RELEASED =
  "event DormantReleased(uint256 indexed internId, uint256 indexed brokerId, address indexed to, address wallet, uint256 ethPaid)";
const INTERN_SHARE_SET =
  "event InternShareSet(uint256 indexed internId, uint256 indexed brokerId, uint16 oldBps, uint16 newBps, uint256 ethPaid)";

const RANDOM_FEE_BPS = 1000n;
const SPECIFIC_FEE_BPS = 1500n;
const ACTIVATION_BURN_BPS = 5000n;
const ACTIVATION_PROTOCOL_BPS = 5000n;

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
  INTERNS_MINT: "Stonk Interns mint fees (ETH leg + $STONKBROKER leg + $1 promotion fee)",
  INTERNS_MINT_PAYROLL: "Stonk Interns mint ETH → intern Clock In payroll (25%)",
  INTERNS_MINT_TREASURY:
    "Stonk Interns mint fees → protocol treasury (75% of the ETH leg, 100% of the STONK leg and the promotion fee)",
  INTERNS_ACTIVATION: "Stonk Interns activation fees in $STONKBROKER",
  INTERNS_ACTIVATION_BURN: "Stonk Interns activation fees burned (50%)",
  INTERNS_ACTIVATION_PROTOCOL: "Stonk Interns activation fees → protocol treasury (50%)",
  SWAP_DESK_FEES: "Swap-desk Relay app fees (1%)",
};

const fetchRobinhood = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();

  const [soldLogs, boughtLogs, loansLogs] = await Promise.all([
    options.getLogs({ target: AMM_VAULT, eventAbi: NFT_SOLD }),
    options.getLogs({ target: AMM_VAULT, eventAbi: NFT_BOUGHT }),
    options.getLogs({ target: LOAN_VAULT, eventAbi: LOAN_CREATED }),
  ]);
  const [activatedLogs, upgradedLogs, internActivatedLogs, internUpgradedLogs] = await Promise.all([
    options.getLogs({ target: ACTIVATION_MANAGER, eventAbi: ACTIVATED }),
    options.getLogs({ target: ACTIVATION_MANAGER, eventAbi: ACTIVATION_UPGRADED }),
    options.getLogs({ target: INTERNS_ACTIVATION, eventAbi: ACTIVATED }),
    options.getLogs({ target: INTERNS_ACTIVATION, eventAbi: ACTIVATION_UPGRADED }),
  ]);

  // ── NFT AMM + loans ──────────────────────────────────────────────────────
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

  // ── Activation fees ──────────────────────────────────────────────────────
  for (const log of [...activatedLogs, ...upgradedLogs]) {
    const fee = BigInt(log.feePaid);
    dailyFees.addToken(STONKBROKER, fee, LABELS.ACTIVATION_FEES);
    dailyHoldersRevenue.addToken(STONKBROKER, (fee * ACTIVATION_BURN_BPS) / 10_000n, LABELS.ACTIVATION_BURN);
    dailyProtocolRevenue.addToken(STONKBROKER, (fee * ACTIVATION_PROTOCOL_BPS) / 10_000n, LABELS.ACTIVATION_PROTOCOL);
    dailyRevenue.addToken(STONKBROKER, fee, LABELS.ACTIVATION_FEES);
  }

  // ── Stonk Interns (mint opened 2026-09-19) ───────────────────────────────
  // A paid release moves one dormant intern out of its parent broker's
  // token-bound wallet. The ETH leg splits 25% payroll / 75% treasury; the
  // $STONKBROKER leg and the $1 promotion fee are 100% treasury. Activation
  // fees mirror the broker activation split (50% burned / 50% treasury).
  const [internReleasedLogs, internShareLogs] = await Promise.all([
    options.getLogs({ target: INTERNS_COLLECTION, eventAbi: INTERN_RELEASED }),
    options.getLogs({ target: INTERNS_COLLECTION, eventAbi: INTERN_SHARE_SET }),
  ]);
  const internStonkPaid: any = await addTokensReceived({
    options,
    tokens: [STONKBROKER],
    fromAdddesses: [INTERNS_COLLECTION],
    target: INTERNS_TREASURY,
  });
  const internMintEth = internReleasedLogs.reduce((sum: bigint, log: any) => sum + BigInt(log.ethPaid), 0n);
  if (internMintEth > 0n) {
    const toPayroll = (internMintEth * INTERNS_MINT_ENGINE_BPS) / 10_000n;
    const toTreasury = internMintEth - toPayroll;
    dailyVolume.addGasToken(internMintEth);
    dailyFees.addGasToken(internMintEth, LABELS.INTERNS_MINT);
    if (toPayroll > 0n) dailySupplySideRevenue.addGasToken(toPayroll, LABELS.INTERNS_MINT_PAYROLL);
    if (toTreasury > 0n) {
      dailyProtocolRevenue.addGasToken(toTreasury, LABELS.INTERNS_MINT_TREASURY);
      dailyRevenue.addGasToken(toTreasury, LABELS.INTERNS_MINT_TREASURY);
    }
  }
  if (internStonkPaid[STONKBROKER] > 0n) {
    dailyFees.addToken(STONKBROKER, internStonkPaid[STONKBROKER], LABELS.INTERNS_MINT);
    dailyProtocolRevenue.addToken(STONKBROKER, internStonkPaid[STONKBROKER], LABELS.INTERNS_MINT_TREASURY);
    dailyRevenue.addToken(STONKBROKER, internStonkPaid[STONKBROKER], LABELS.INTERNS_MINT_TREASURY);
  }
  for (const log of internShareLogs) {
    const fee = BigInt(log.ethPaid);
    if (fee <= 0n) continue;
    dailyFees.addGasToken(fee, LABELS.INTERNS_MINT);
    dailyProtocolRevenue.addGasToken(fee, LABELS.INTERNS_MINT_TREASURY);
    dailyRevenue.addGasToken(fee, LABELS.INTERNS_MINT_TREASURY);
  }
  for (const log of [...internActivatedLogs, ...internUpgradedLogs]) {
    const fee = BigInt(log.feePaid);
    if (fee <= 0n) continue;
    const burned = (fee * ACTIVATION_BURN_BPS) / 10_000n;
    const protocol = (fee * ACTIVATION_PROTOCOL_BPS) / 10_000n;
    dailyFees.addToken(STONKBROKER, fee, LABELS.INTERNS_ACTIVATION);
    dailyHoldersRevenue.addToken(STONKBROKER, burned, LABELS.INTERNS_ACTIVATION_BURN);
    dailyProtocolRevenue.addToken(STONKBROKER, protocol, LABELS.INTERNS_ACTIVATION_PROTOCOL);
    dailyRevenue.addToken(STONKBROKER, fee, LABELS.INTERNS_ACTIVATION);
  }

  return { dailyVolume, dailyFees, dailyRevenue, dailyProtocolRevenue, dailySupplySideRevenue, dailyHoldersRevenue };
};

/** Base: Relay swap-desk 1% app fee, measured as Base USDC leaving the fee wallet
 *  on its way to StockBooster via Relay (the wallet's only USDC outflows). */
const fetchBase = async (options: FetchOptions) => {
  const swapDeskFees = await addTokensReceived({ options, fromAddressFilter: RELAY_FEE_WALLET, tokens: [BASE_USDC] });
  const dailyFees = swapDeskFees.clone(1, LABELS.SWAP_DESK_FEES);
  return {
    dailyFees,
    // Entire desk fee is forwarded to StockBooster as a Clock In bonus top-up —
    // supply-side only (mirrors how NFTFi booster share is attributed).
    dailySupplySideRevenue: dailyFees,
    dailyRevenue: 0,
    dailyProtocolRevenue: 0,
    dailyHoldersRevenue: 0,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  adapter: {
    [CHAIN.ROBINHOOD]: { fetch: fetchRobinhood, start: "2026-07-17" },
    [CHAIN.BASE]: { fetch: fetchBase, start: "2026-07-17" },
  },
  methodology: {
    Volume:
      "NFT AMM fills (ethFeePaid ÷ fee bps) and Stonk Interns paid mint releases (DormantReleased.ethPaid, the $20 ETH leg).",
    Fees:
      "ETH fees on NFT AMM trades + NFT-backed loans; $STONKBROKER broker activation/upgrade fees; Stonk Interns mint fees (ETH leg, $STONKBROKER leg, $1 promotion fee) and intern activation fees; and the Relay swap-desk 1% app fee (Base USDC forwarded to StockBooster).",
    Revenue:
      "30% of NFTFi ETH fees, the full $STONKBROKER activation fee (burn + protocol), and the Stonk Interns protocol share (75% of the ETH mint leg, 100% of the STONK leg and promotion fee, the full intern activation fee).",
    ProtocolRevenue:
      "30% of NFTFi ETH fees → ProtocolFeeSink; protocol half of $STONKBROKER activation fees; Stonk Interns treasury legs and the protocol half of intern activation fees.",
    HoldersRevenue: "Half of the $STONKBROKER broker and intern activation/upgrade fees burned.",
    SupplySideRevenue:
      "70% of NFTFi ETH fees → StockBooster stock dividends; 25% of the Stonk Interns mint ETH leg → intern Clock In payroll; Relay swap-desk 1% app fees forwarded to StockBooster.",
  },
  breakdownMethodology: {
    Fees: {
      [LABELS.AMM_FEES]: "ETH trade fees on buyRandomNFT / buySpecificNFT / sellNFT.",
      [LABELS.LOAN_FEES]: "Upfront ETH borrow fees on NFT-backed loans.",
      [LABELS.ACTIVATION_FEES]: "One-time / upgrade $STONKBROKER activation fees.",
      [LABELS.INTERNS_MINT]:
        "Stonk Interns mint fees: the $20 ETH leg of every paid release (DormantReleased.ethPaid), the $STONKBROKER mint leg (STONKBROKER transfers from the collection to the protocol treasury), and the flat $1 ETH promotion fee on every intern pay-share raise (InternShareSet.ethPaid).",
      [LABELS.INTERNS_ACTIVATION]:
        "One-time / upgrade $STONKBROKER activation fees on Stonk Interns (InternActivationManager Activated / ActivationUpgraded feePaid).",
      [LABELS.SWAP_DESK_FEES]:
        "1% Relay app fee on the crypto swap desk, measured as Base USDC Transfer outflows from the fee wallet toward StockBooster.",
    },
    Revenue: {
      [LABELS.AMM_PROTOCOL_TREASURY]: "30% of ETH AMM fees retained by ProtocolFeeSink.",
      [LABELS.LOAN_PROTOCOL_TREASURY]: "30% of ETH loan fees retained by ProtocolFeeSink.",
      [LABELS.ACTIVATION_FEES]: "Full $STONKBROKER activation fee (burn + protocol).",
      [LABELS.INTERNS_MINT_TREASURY]:
        "Stonk Interns protocol share: 75% of the $20 ETH mint leg, 100% of the $STONKBROKER mint leg, and the $1 pay-share promotion fee (the 25% payroll leg is supply side).",
      [LABELS.INTERNS_ACTIVATION]: "Full $STONKBROKER intern activation fee (burned half + protocol half).",
    },
    ProtocolRevenue: {
      [LABELS.AMM_PROTOCOL_TREASURY]: "30% of ETH AMM fees retained by ProtocolFeeSink.",
      [LABELS.LOAN_PROTOCOL_TREASURY]: "30% of ETH loan fees retained by ProtocolFeeSink.",
      [LABELS.ACTIVATION_PROTOCOL]: "Protocol share of $STONKBROKER activation fees.",
      [LABELS.INTERNS_MINT_TREASURY]:
        "Stonk Interns protocol share: 75% of the $20 ETH mint leg, 100% of the $STONKBROKER mint leg, and the $1 pay-share promotion fee.",
      [LABELS.INTERNS_ACTIVATION_PROTOCOL]: "Half of Stonk Interns activation fees in $STONKBROKER → protocol treasury.",
    },
    HoldersRevenue: {
      [LABELS.ACTIVATION_BURN]: "Burned share of $STONKBROKER activation fees (deflationary).",
      [LABELS.INTERNS_ACTIVATION_BURN]: "Burned half of Stonk Interns activation fees in $STONKBROKER (deflationary).",
    },
    SupplySideRevenue: {
      [LABELS.AMM_STOCK_DIVIDENDS]: "70% of ETH AMM fees → StockBooster stock-token dividend drops to activated brokers.",
      [LABELS.LOAN_STOCK_DIVIDENDS]: "70% of ETH loan fees → StockBooster stock-token dividend drops to activated brokers.",
      [LABELS.INTERNS_MINT_PAYROLL]:
        "25% of the Stonk Interns mint ETH leg → the intern Clock In payroll wallet (funds the first intern Clock In rounds).",
      [LABELS.SWAP_DESK_FEES]: "Relay swap-desk 1% app fee forwarded to StockBooster as a Clock In bonus top-up.",
    },
  },
};

export default adapter;
