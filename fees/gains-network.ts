import { Adapter, ChainBlocks, FetchOptions, FetchResultFees } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import ADDRESSES from "../helpers/coreAssets.json";
import { Chain } from "@defillama/sdk/build/general";

type IAddresses = {
  [s: string | Chain]: string[];
};

const event: string[] = [
  "event DevGovFeeCharged(address indexed trader, uint valueDai)",
  "event SssFeeCharged(address indexed trader, uint valueDai)",
  "event ReferralFeeCharged(address indexed trader, uint valueDai)",
  "event NftBotFeeCharged(address indexed trader, uint valueDai)",
  "event DaiVaultFeeCharged(address indexed trader, uint valueDai)",
  "event LpFeeCharged(address indexed trader, uint valueDai)",
  "event TriggerFeeCharged(address indexed trader, uint valueDai)",
  "event GovFeeCharged(address indexed trader, uint valueDai, bool distributed)",
  "event BorrowingFeeCharged(address indexed trader, uint tradeValueDai, uint valueDai)",
];

const eventV8: string[] = [
  "event GovFeeCharged(address indexed trader, uint8 indexed collateralIndex, uint256 amountCollateral)",
  "event ReferralFeeCharged(address indexed trader, uint8 indexed collateralIndex, uint256 amountCollateral)",
  "event TriggerFeeCharged(address indexed trader, uint8 indexed collateralIndex, uint256 amountCollateral)",
  "event GnsStakingFeeCharged(address indexed trader, uint8 indexed collateralIndex, uint256 amountCollateral)",
  "event GTokenFeeCharged(address indexed trader, uint8 indexed collateralIndex, uint256 amountCollateral)",
  "event BorrowingFeeCharged(address indexed trader, uint8 indexed collateralIndex, uint256 amountCollateral)",
];

// Pre-v8
const addressConfig: { [a: string]: string } = {
  "0x82e59334da8c667797009bbe82473b55c7a6b311": ADDRESSES.polygon.DAI,
  "0x0bbed2eac3237ba128643670b7cf3be475933755": ADDRESSES.polygon.WETH,
  "0x2ac6749d0affd42c8d61ef25e433f92e375a1aef": ADDRESSES.polygon.USDC_CIRCLE,
  "0x298a695906e16aea0a184a2815a76ead1a0b7522": ADDRESSES.arbitrum.DAI,
  "0x62a9f50c92a57c719ff741133caa55c7a81ce019": ADDRESSES.arbitrum.WETH,
  "0x4542256c583bcad66a19a525b57203773a6485bf": ADDRESSES.arbitrum.USDC_CIRCLE,
};

// Post-v8
const collateralIndexMap: { [s: string | Chain]: { [a: number]: string } } = {
  [CHAIN.POLYGON]: { 1: ADDRESSES.polygon.DAI, 2: ADDRESSES.polygon.WETH, 3: ADDRESSES.polygon.USDC_CIRCLE },
  [CHAIN.ARBITRUM]: { 1: ADDRESSES.arbitrum.DAI, 2: ADDRESSES.arbitrum.WETH, 3: ADDRESSES.arbitrum.USDC_CIRCLE },
  [CHAIN.BASE]: { 1: ADDRESSES.base.USDC },
};

const contract_addresses: IAddresses = {
  [CHAIN.POLYGON]: [
    "0x82e59334da8c667797009bbe82473b55c7a6b311", // DAI TradingCallbacks
    "0x0bbed2eac3237ba128643670b7cf3be475933755", // ETH TradingCallbacks
    "0x2ac6749d0affd42c8d61ef25e433f92e375a1aef", // USDC TradingCallbacks
    "0x209a9a01980377916851af2ca075c2b170452018", // v8 Diamond
  ],
  [CHAIN.ARBITRUM]: [
    "0x298a695906e16aea0a184a2815a76ead1a0b7522", // DAI TradingCallbacks
    "0x62a9f50c92a57c719ff741133caa55c7a81ce019", // ETH TradingCallbacks
    "0x4542256c583bcad66a19a525b57203773a6485bf", // USDC TradingCallbacks
    "0xff162c694eaa571f685030649814282ea457f169", // v8 Diamond
  ],
  [CHAIN.BASE]: [
    "0x6cD5aC19a07518A8092eEFfDA4f1174C72704eeb", // v9.3 Diamond
  ],
};

const fetch = (chain: Chain) => {
  return async (timestamp: number, _: ChainBlocks, { createBalances, getLogs }: FetchOptions): Promise<FetchResultFees> => {
    const collateralIndexToToken = collateralIndexMap[chain];
    const dailyFees = createBalances();
    const dailyRevenue = createBalances();
    const dailyHoldersRevenue = createBalances();

    for (const target of contract_addresses[chain]) {
      const token = addressConfig[target];

      // pre-v8
      if (token) {
        const [devFee, ssFee, referralFee, nftBotFee, daiVault, lpFee, triggerFee, govFee, borrowingFee]: any = await Promise.all(
          event.map((eventAbi) => getLogs({ target, eventAbi }))
        );

        [devFee, ssFee, referralFee, nftBotFee, daiVault, lpFee, triggerFee, govFee, borrowingFee]
          .flat()
          .forEach((i: any) => dailyFees.add(token, i.valueDai));
        [devFee, ssFee, govFee].flat().forEach((i: any) => dailyRevenue.add(token, i.valueDai));
        ssFee.forEach((i: any) => dailyHoldersRevenue.add(token, i.valueDai));
      } else {
        // v8
        const [govFee, referralFee, triggerFee, stakingFee, gTokenFee, borrowingFee]: any = await Promise.all(
          eventV8.map((eventAbi) => getLogs({ target, eventAbi }))
        );

        [govFee, referralFee, triggerFee, stakingFee, gTokenFee, borrowingFee]
          .flat()
          .forEach((i: any) => dailyFees.add(collateralIndexToToken[i.collateralIndex], i.amountCollateral));
        [govFee, stakingFee].flat().forEach((i: any) => dailyRevenue.add(collateralIndexToToken[i.collateralIndex], i.amountCollateral));
        stakingFee.forEach((i: any) => dailyHoldersRevenue.add(collateralIndexToToken[i.collateralIndex], i.amountCollateral));
      }
    }

    return { timestamp, dailyFees, dailyRevenue, dailyHoldersRevenue };
  };
};

const adapter: Adapter = {
  adapter: {
    [CHAIN.POLYGON]: {
      fetch: fetch(CHAIN.POLYGON),
      start: 1654214400,
    },
    [CHAIN.ARBITRUM]: {
      fetch: fetch(CHAIN.ARBITRUM),
      start: 1672358400,
    },
    [CHAIN.BASE]: {
      fetch: fetch(CHAIN.BASE),
      start: 1727351131,
    },
  },
};

export default adapter;
