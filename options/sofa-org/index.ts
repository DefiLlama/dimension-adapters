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

const tokens = {
  [CHAIN.ETHEREUM]: {
    usdt: ADDRESSES.ethereum.USDT,
    rch: "0x57B96D4aF698605563A4653D882635da59Bf11AF",
    scrvusd: "0x0655977FEb2f289A4aB78af67BAB0d17aAb84367",
    ausdt: "0x23878914EFE38d27C4D67Ab83ed1b93A74D4086a",
    zrch: "0x57B96D4aF698605563A4653D882635da59Bf11AF", //rch, because no zRCH price
    steth: ADDRESSES.ethereum.STETH,
    crvusd: ADDRESSES.ethereum.CRVUSD,
    crv: ADDRESSES.ethereum.CRV,
  },
  [CHAIN.ARBITRUM]: {
    usdt: ADDRESSES.arbitrum.USDT,
    usdc: ADDRESSES.arbitrum.USDC_CIRCLE,
    ausdt: "0x6ab707Aca953eDAeFBc4fD23bA73294241490620",
  },
  [CHAIN.BSC]: {
    usdt: ADDRESSES.bsc.USDT,
  },
  [CHAIN.POLYGON]: {
    usdt: ADDRESSES.polygon.USDT,
  },
  [CHAIN.SEI]: {
    susda: "0x6aB5d5E96aC59f66baB57450275cc16961219796",
    usdc: ADDRESSES.sei.USDC,
  },
}

const startTimestamp = {
  [CHAIN.ETHEREUM]: 1717679579,
  [CHAIN.ARBITRUM]: 1717665701,
  [CHAIN.BSC]: 1726038205,
  [CHAIN.POLYGON]: 1733383076,
  [CHAIN.SEI]: 1739963336,
}

const contractsJsonFile = 'https://raw.githubusercontent.com/sofa-org/sofa-gitbook/main/static/contracts_for_defillama_premium.json';

let allContracts: any;
const fetch = async (options: FetchOptions) => {
  if (!allContracts) {
    allContracts = await getConfig('sofa-org/premium', contractsJsonFile);
  }
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
      //console.log("dailyPremiumVolume:", dailyPremiumVolume);
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