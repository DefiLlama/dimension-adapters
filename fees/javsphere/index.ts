import { FetchOptions, FetchResultFees, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const methodology = {
  Fees: "LeverageX traders paying fees for open trades.",
}

const tokens = [
  // weth
  "0x4200000000000000000000000000000000000006",
  // cbbtc
  "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf",
  // usdc
  "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  // jav
  "0xEdC68c4c54228D273ed50Fc450E253F685a2c6b9"
]

const fetchBase = async ({ createBalances, getLogs }: FetchOptions): Promise<FetchResultFees> => {
  const dailyFees = createBalances();
  const dailyRevenue = createBalances();
  const dailyHoldersRevenue = createBalances();
  const dailySupplySideRevenue = createBalances();
  const dailyProtocolRevenue = createBalances();
  const DIAMOND = "0xBF35e4273db5692777EA475728fDbBa092FFa1B3";

  const [govFee, referralFee, triggerFee, rewardFee, borrowingFee]: any = await Promise.all(
    [
      "event GovFeeCharged(address indexed trader, uint8 indexed collateralIndex, uint256 amountCollateral)",
      "event ReferralFeeCharged(address indexed trader, uint8 indexed collateralIndex, uint256 amountCollateral)",
      "event TriggerFeeCharged(address indexed trader, uint8 indexed collateralIndex, uint256 amountCollateral)",
      "event RewardsFeeCharged(address indexed trader, uint8 indexed collateralIndex, uint256 amountCollateral)",
      "event BorrowingProviderFeeCharged(address indexed trader, uint8 indexed collateralIndex, uint256 amountCollateral)",
    ].map((eventAbi) => getLogs({ target: DIAMOND, eventAbi }))
  );

  [govFee, referralFee, triggerFee, rewardFee, borrowingFee].flat().forEach((i: any) => dailyFees.add(tokens[i.collateralIndex], i.amountCollateral));
  [govFee, rewardFee, triggerFee].flat().forEach((i: any) => dailyRevenue.add(tokens[i.collateralIndex], i.amountCollateral));
  [borrowingFee].flat().forEach((i: any) => dailySupplySideRevenue.add(tokens[i.collateralIndex], i.amountCollateral));
  [rewardFee].flat().forEach((i: any) => dailyHoldersRevenue.add(tokens[i.collateralIndex], i.amountCollateral));
  [govFee, triggerFee].flat().forEach((i: any) => dailyProtocolRevenue.add(tokens[i.collateralIndex], i.amountCollateral));

  return { dailyFees, dailyRevenue, dailyHoldersRevenue, dailySupplySideRevenue, dailyProtocolRevenue };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.BASE]: {
      fetch: fetchBase,
      start: "2024-12-18",
      meta: {
        methodology
      },
    },
  },
};

export default adapter;
