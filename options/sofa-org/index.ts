import ADDRESSES from "../../helpers/coreAssets.json";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getConfig } from "../../helpers/cache";

const eventABIs = {
  dnt:        "event Minted(address minter, address maker, address referral, uint256 totalCollateral, uint256 term, uint256 expiry, uint256[2] anchorPrices, uint256 makerCollateral)",
  smarttrend: "event Minted(address minter, address maker, address referral, uint256 totalCollateral,               uint256 expiry, uint256[2] anchorPrices, uint256 makerCollateral)",
  lev_earn:   "event Minted(address minter, address maker, address referral, uint256 totalCollateral,               uint256 expiry, uint256[2] anchorPrices, uint256 makerCollateral, uint256 collateralAtRiskPercentage)",
  lev_dnt:    "event Minted(address minter, address maker, address referral, uint256 totalCollateral, uint256 term, uint256 expiry, uint256[2] anchorPrices, uint256 makerCollateral, uint256 collateralAtRiskPercentage)",
  dual:       "event Minted(address minter, address maker, address referral, uint256 totalCollateral,               uint256 expiry, uint256 anchorPrice, uint256 makerCollateral, uint256 premiumPercentage)",
}

const startTimestamp = {
  [CHAIN.ETHEREUM]: 1717679579,
  [CHAIN.ARBITRUM]: 1717665701,
  [CHAIN.BSC]: 1726038205,
  [CHAIN.POLYGON]: 1733383076,
  [CHAIN.SEI]: 1739963336,
}

const contractsJsonFile = 'https://raw.githubusercontent.com/sofa-org/sofa-gitbook/main/static/contracts_tokens_for_defillama_premium.json';

let allContracts: any;
const fetch = async (options: FetchOptions) => {
  if (!allContracts) {
    allContracts = await getConfig('sofa-org/premium', contractsJsonFile);
  }
  const tokens = allContracts.tokens;
  const dailyPremiumVolume = options.createBalances();
  const chain = options.chain;
  for (const product in allContracts[chain]) {
    const eventAbi = eventABIs[product];
    const contractsInProduct = allContracts[chain][product];
    for (const tokenSymbol in contractsInProduct) {
      const contracts = contractsInProduct[tokenSymbol];
      const token = tokens[chain][tokenSymbol];
      const data  = await options.getLogs({
          targets: contracts,
          eventAbi: eventAbi,
      });
      if (product.includes("lev")) {
        data.forEach((log: any) => dailyPremiumVolume.add(token, (log.totalCollateral as bigint) * (log.collateralAtRiskPercentage as bigint) / 10n ** 18n - log.makerCollateral));
      } else if (product.includes("dual")) {
        data.forEach((log: any) => dailyPremiumVolume.add(token, log.makerCollateral));
      } else {
        data.forEach((log: any) => dailyPremiumVolume.add(token, log.totalCollateral - log.makerCollateral));
      }
    }
  }
  return { dailyPremiumVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter:{
    [CHAIN.ETHEREUM]: {
      fetch,
      start: startTimestamp[CHAIN.ETHEREUM],
    },
    [CHAIN.ARBITRUM]: {
      fetch,
      start: startTimestamp[CHAIN.ARBITRUM],
    },
    [CHAIN.BSC]: {
      fetch,
      start: startTimestamp[CHAIN.BSC],
    },
    [CHAIN.POLYGON]: {
      fetch,
      start: startTimestamp[CHAIN.POLYGON],
    },
    [CHAIN.SEI]: {
      fetch,
      start: startTimestamp[CHAIN.SEI],
    },
  }
}

export default adapter;