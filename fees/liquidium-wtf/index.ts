import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";
import { httpGet } from "../../utils/fetchURL";

const FEES_API = "https://app.liquidium.wtf/api/defi-llama/fees";
const SATS_PER_BTC = 1e8;

// 30% of protocol revenue buys LIQ on the open market for sLIQ stakers.
// Staking launched in September 2025; before that all revenue stayed with the protocol.
const BUYBACK_SHARE = 0.3;
const BUYBACK_START = Date.UTC(2025, 8, 17) / 1000;

const ACTIVATION_FEES = "Loan Activation Fees";
const INTEREST_TO_PROTOCOL = "Borrow Interest To Protocol";
const INTEREST_TO_LENDERS = "Borrow Interest To Lenders";
const PROTOCOL_SHARE = "Revenue Kept By Protocol";

// NFT-collateral loans on EVM chains run through one LoanCore contract per chain.
const EVM_CHAINS: Record<string, { loanCore: string; start: string }> = {
  [CHAIN.ROBINHOOD]: { loanCore: "0x853918Ed9f97944ed50Dc50f3C9Fc50469ba7B02", start: "2026-09-14" },
  [CHAIN.ETHEREUM]: { loanCore: "0xEC79B5DC18c5B859b785AFD0f6914B479B295F9b", start: "2026-10-07" },
};
const LOAN_ORIGINATED_EVENT =
  "event LoanOriginated(uint256 indexed loanId, bytes32 indexed offerHash, address indexed borrower, address lender, address collection, address asset, uint256 tokenId, uint256 collectionValue, uint256 principal, uint256 repayment, uint64 maturity, uint16 feeBps, uint256 activationFee)";
const LOAN_REPAID_EVENT =
  "event LoanRepaid(uint256 indexed loanId, address indexed payer, uint256 repayment, uint256 fee)";
const GET_LOAN_ABI =
  "function getLoan(uint256 loanId) view returns ((address borrower, uint64 startTime, uint16 feeBps, uint8 status, bool collateralHeld, address lender, uint64 maturity, address collection, address asset, uint256 tokenId, uint256 principal, uint256 repayment))";

type FeeHistoryResponse = {
  success: boolean;
  asset: string;
  decimals: number;
  activationFees: unknown;
  protocolInterestFees: unknown;
  lenderInterest: unknown;
};

function satsToBtc(rawAmount: unknown): number {
  if (typeof rawAmount !== "string" || !/^\d+$/.test(rawAmount)) {
    throw new Error("Liquidium WTF fees API returned an invalid amount");
  }
  return Number(rawAmount) / SATS_PER_BTC;
}

function buybackShare(options: FetchOptions): number {
  return options.startTimestamp >= BUYBACK_START ? BUYBACK_SHARE : 0;
}

async function fetchBitcoin(options: FetchOptions) {
  const query = new URLSearchParams({
    from: new Date(options.startTimestamp * 1000).toISOString(),
    to: new Date(options.endTimestamp * 1000).toISOString(),
  });
  const response = (await httpGet(`${FEES_API}?${query}`)) as FeeHistoryResponse;

  if (response.success !== true || response.asset !== "BTC" || response.decimals !== 8) {
    throw new Error("Liquidium WTF fees API returned an invalid response");
  }

  const activationFees = satsToBtc(response.activationFees);
  const protocolInterestFees = satsToBtc(response.protocolInterestFees);
  const lenderInterest = satsToBtc(response.lenderInterest);

  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();

  dailyFees.addCGToken("bitcoin", activationFees, ACTIVATION_FEES);
  dailyFees.addCGToken("bitcoin", protocolInterestFees, INTEREST_TO_PROTOCOL);
  dailyFees.addCGToken("bitcoin", lenderInterest, INTEREST_TO_LENDERS);

  dailyRevenue.addCGToken("bitcoin", activationFees, ACTIVATION_FEES);
  dailyRevenue.addCGToken("bitcoin", protocolInterestFees, INTEREST_TO_PROTOCOL);

  dailySupplySideRevenue.addCGToken("bitcoin", lenderInterest, INTEREST_TO_LENDERS);

  const holdersShare = buybackShare(options);
  const revenue = activationFees + protocolInterestFees;
  dailyHoldersRevenue.addCGToken("bitcoin", revenue * holdersShare, METRIC.TOKEN_BUY_BACK);
  dailyProtocolRevenue.addCGToken("bitcoin", revenue * (1 - holdersShare), PROTOCOL_SHARE);

  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailyProtocolRevenue,
    dailyHoldersRevenue,
    dailySupplySideRevenue,
  };
}

// Fees accrue in the loan asset (WETH or USDG). The activation fee is kept from the principal
// at origination; on repayment the protocol keeps `fee` of the interest and the lender the rest.
async function fetchEvm(options: FetchOptions) {
  const target = EVM_CHAINS[options.chain].loanCore;
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();
  const holdersBps = BigInt(Math.round(buybackShare(options) * 10_000));

  function addRevenue(asset: string, amount: bigint, label: string) {
    const holders = (amount * holdersBps) / 10_000n;
    dailyRevenue.add(asset, amount, label);
    dailyHoldersRevenue.add(asset, holders, METRIC.TOKEN_BUY_BACK);
    dailyProtocolRevenue.add(asset, amount - holders, PROTOCOL_SHARE);
  }

  const originated = await options.getLogs({ target, eventAbi: LOAN_ORIGINATED_EVENT });
  for (const log of originated) {
    const activationFee = BigInt(log.activationFee);
    dailyFees.add(log.asset, activationFee, ACTIVATION_FEES);
    addRevenue(log.asset, activationFee, ACTIVATION_FEES);
  }

  const repaid = await options.getLogs({ target, eventAbi: LOAN_REPAID_EVENT });
  const loans = await options.api.multiCall({
    target,
    abi: GET_LOAN_ABI,
    calls: repaid.map((log: any) => log.loanId),
  });
  repaid.forEach((log: any, i: number) => {
    const { asset, principal } = loans[i];
    const interest = BigInt(log.repayment) - BigInt(principal);
    const protocolFee = BigInt(log.fee);
    dailyFees.add(asset, protocolFee, INTEREST_TO_PROTOCOL);
    dailyFees.add(asset, interest - protocolFee, INTEREST_TO_LENDERS);
    addRevenue(asset, protocolFee, INTEREST_TO_PROTOCOL);
    dailySupplySideRevenue.add(asset, interest - protocolFee, INTEREST_TO_LENDERS);
  });

  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailyProtocolRevenue,
    dailyHoldersRevenue,
    dailySupplySideRevenue,
  };
}

const methodology = {
  Fees: "Activation fees charged when a loan starts, plus interest paid by borrowers on repaid loans, after LIQ holder discounts. On Robinhood Chain and Ethereum they are read from the LoanCore contract's LoanOriginated and LoanRepaid events.",
  UserFees: "Activation fees charged when a loan starts, plus interest paid by borrowers on repaid loans, after LIQ holder discounts. On Robinhood Chain and Ethereum they are read from the LoanCore contract's LoanOriginated and LoanRepaid events.",
  Revenue: "Activation fees plus the Liquidium share of interest on repaid loans.",
  ProtocolRevenue: "Revenue kept by Liquidium after LIQ buybacks.",
  HoldersRevenue: "30% of revenue buys LIQ on the open market and is distributed to sLIQ stakers, since staking launched in September 2025.",
  SupplySideRevenue: "Interest credited to lenders on repaid loans.",
};

const breakdownMethodology = {
  Fees: {
    [ACTIVATION_FEES]: "One-time fee charged to the borrower when a loan starts on-chain.",
    [INTEREST_TO_PROTOCOL]: "Liquidium's share of the interest on repaid loans, after LIQ holder discounts.",
    [INTEREST_TO_LENDERS]: "Interest credited to lenders on repaid loans.",
  },
  UserFees: {
    [ACTIVATION_FEES]: "One-time fee charged to the borrower when a loan starts on-chain.",
    [INTEREST_TO_PROTOCOL]: "Liquidium's share of the interest on repaid loans, after LIQ holder discounts.",
    [INTEREST_TO_LENDERS]: "Interest credited to lenders on repaid loans.",
  },
  Revenue: {
    [ACTIVATION_FEES]: "One-time fee charged to the borrower when a loan starts on-chain.",
    [INTEREST_TO_PROTOCOL]: "Liquidium's share of the interest on repaid loans, after LIQ holder discounts.",
  },
  ProtocolRevenue: {
    [PROTOCOL_SHARE]: "Revenue kept by Liquidium after LIQ buybacks.",
  },
  HoldersRevenue: {
    [METRIC.TOKEN_BUY_BACK]: "30% of revenue used for daily LIQ buybacks distributed to sLIQ stakers.",
  },
  SupplySideRevenue: {
    [INTEREST_TO_LENDERS]: "Interest credited to lenders on repaid loans.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.BITCOIN]: { fetch: fetchBitcoin, start: "2024-03-09" },
    ...Object.fromEntries(
      Object.entries(EVM_CHAINS).map(([chain, { start }]) => [chain, { fetch: fetchEvm, start }]),
    ),
  },
  pullHourly: true,
  methodology,
  breakdownMethodology,
};

export default adapter;
