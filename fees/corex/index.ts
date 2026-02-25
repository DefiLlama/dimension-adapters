import { FetchOptions, FetchResultFees, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const MARKETS = "0xb212b1E9b00aD54fB5419E6231E0b4300dB9F40F";
const TOKEN_CORE = "0x40375C92d9FAf44d2f9db9Bd9ba41a3317a2404f";
const TOKEN_USDT = "0x900101d06A7426441Ae63e9AB3B9b0F63Be145F1";

const tokens = [
  TOKEN_CORE,
  TOKEN_USDT,
];

const fetch = async ({ createBalances, getLogs }: FetchOptions): Promise<FetchResultFees> => {
  const dailyFees = createBalances();
  const dailyRevenue = createBalances();
  const dailySupplySideRevenue = createBalances();

  const [govFeeLogs, referralFeeLogs, vaultFeeLogs, borrowingFeeLogs]: any = await Promise.all(
    [
      "event GovFeeCharged(address indexed trader, uint8 indexed collateralIndex, uint16 indexed pairIndex, uint256 amountCollateral)",
      "event ReferralFeeCharged(address indexed trader, uint8 indexed collateralIndex, uint16 indexed pairIndex, uint256 amountCollateral)",
      "event VaultFeeCharged(address indexed trader, uint8 indexed collateralIndex, uint16 indexed pairIndex, uint256 amountCollateral)",
      "event BorrowingFeeCharged(address indexed trader, uint8 indexed collateralIndex, uint16 indexed pairIndex, uint256 amountCollateral)",
    ].map((eventAbi) => getLogs({ target: MARKETS, eventAbi }))
  );

  // borrowing fees and referral fees to supply-side
  for (const log of borrowingFeeLogs) {
    dailyFees.add(tokens[log.collateralIndex], log.amountCollateral, 'Borrowing Fees');
    dailySupplySideRevenue.add(tokens[log.collateralIndex], log.amountCollateral, 'Borrowing Fees');
  }

  for (const log of referralFeeLogs) {
    dailyFees.add(tokens[log.collateralIndex], log.amountCollateral, 'Referral Fees');
    dailySupplySideRevenue.add(tokens[log.collateralIndex], log.amountCollateral, 'Referral Fees');
  }

  // governance and vault fees to protocol
  for (const log of govFeeLogs) {
    dailyFees.add(tokens[log.collateralIndex], log.amountCollateral, 'Governance Fees');
    dailyRevenue.add(tokens[log.collateralIndex], log.amountCollateral, 'Governance Fees');
  }
  
  for (const log of vaultFeeLogs) {
    dailyFees.add(tokens[log.collateralIndex], log.amountCollateral, 'Vault Fees');
    dailyRevenue.add(tokens[log.collateralIndex], log.amountCollateral, 'Vault Fees');
  }

  return {
    dailyFees,
    dailyRevenue,
    dailySupplySideRevenue,
    dailyProtocolRevenue: dailyRevenue,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.CORE],
  start: '2026-01-01',
  methodology: {
    Fees: "Corex Markets Fees tracked by execution of orders.",
    Revenue: "Revenue collected from governance and vault fees.",
    ProtocolRevenue: "Corex gets all revenue collected from governance and vault fees.",
    SupplySideRevenue: "Borrowing fees are distributed to suppliers and fees to referrals.",
  },
  breakdownMethodology: {
    Fees: {
      'Governance Fees': 'All governance fees are charged.',
      'Borrowing Fees': 'All borrowing fees are charged.',
      'Referral Fees': 'Amount of fees are shared to referrals.',
      'Vault Fees': 'Amount of vault fees are charged.',
    },
    SupplySideRevenue: {
      'Borrowing Fees': 'All borrowing fees are distributed to suppliers.',
      'Referral Fees': 'Amount of fees are shared to referrals.',
    },
    Revenue: {
      'Governance Fees': 'All governance fees are charged.',
      'Vault Fees': 'Amount of vault fees are charged.',
    },
    ProtocolRevenue: {
      'Governance Fees': 'All governance fees are charged.',
      'Vault Fees': 'Amount of vault fees are charged.',
    },
  }
};

export default adapter;
