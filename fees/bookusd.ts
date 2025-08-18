import { CHAIN } from "../helpers/chains";
import { liquityV1Exports } from "../helpers/liquity";

export default liquityV1Exports({
  [CHAIN.BSC]: {
    troveManager: "0xFe5D0aBb0C4Addbb57186133b6FDb7E1FAD1aC15",
    stableCoin: "0xc28957E946AC244612BcB205C899844Cbbcb093D",
    holderRevenuePercentage: 100,
    collateralCoin: '0xc9ad421f96579ace066ec188a7bba472fb83017f', // BOOK
  },
});
