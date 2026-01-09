import { FetchOptions, FetchResultFees, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const methodology = {
  Fees: "Corex Markets Fees tracked by execution of orders.",
}

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
  const dailyHoldersRevenue = createBalances();
  const dailySupplySideRevenue = createBalances();
  const dailyProtocolRevenue = createBalances();

  const [govFee, referralFee, vaultFee, borrowingFee]: any = await Promise.all(
    [
      "event GovFeeCharged(address indexed trader, uint8 indexed collateralIndex, uint16 indexed pairIndex, uint256 amountCollateral)",
      "event ReferralFeeCharged(address indexed trader, uint8 indexed collateralIndex, uint16 indexed pairIndex, uint256 amountCollateral)",
      "event VaultFeeCharged(address indexed trader, uint8 indexed collateralIndex, uint16 indexed pairIndex, uint256 amountCollateral)",
      "event BorrowingFeeCharged(address indexed trader, uint8 indexed collateralIndex, uint16 indexed pairIndex, uint256 amountCollateral)",
    ].map((eventAbi) => getLogs({ target: MARKETS, eventAbi }))
  );

  [govFee, referralFee, vaultFee, borrowingFee]
    .flat()
    .forEach((i: any) => dailyFees.add(tokens[i.collateralIndex], i.amountCollateral));

  [govFee]
    .flat()
    .forEach((i: any) => dailyRevenue.add(tokens[i.collateralIndex], i.amountCollateral));

  [borrowingFee, referralFee]
    .flat()
    .forEach((i: any) => dailySupplySideRevenue.add(tokens[i.collateralIndex], i.amountCollateral));

  [vaultFee]
    .flat()
    .forEach((i: any) => dailyProtocolRevenue.add(tokens[i.collateralIndex], i.amountCollateral));

  [govFee]
    .flat()
    .forEach((i: any) => dailyProtocolRevenue.add(tokens[i.collateralIndex], i.amountCollateral));

  return {
    dailyFees,
    dailyRevenue,
    dailySupplySideRevenue,
    dailyProtocolRevenue
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.CORE],
  start: '2026-01-01',
  methodology
};

export default adapter;
