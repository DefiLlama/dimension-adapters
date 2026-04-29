import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

// https://docs.midas.app/resources/smart-contracts-registry
const oracleAbi = "function lastAnswer() external view returns (int256)";
const totalSupplyAbi = "function totalSupply() external view returns (uint256)";

const denominationCGId: Record<string, string> = {
  BTC: "bitcoin",
  ETH: "ethereum",
};

interface TokenConfig {
  address: string;
  oracle: string;
  denomination?: string;
}

const config: Record<string, Record<string, TokenConfig>> = {
  [CHAIN.ETHEREUM]: {
    mTBILL: { address: "0xDD629E5241CbC5919847783e6C96B2De4754e438", oracle: "0x056339C044055819E8Db84E71f5f2E1F536b2E5b" },
    mBASIS: { address: "0x2a8c22E3b10036f3AEF5875d04f8441d4188b656", oracle: "0xE4f2AE539442e1D3Fb40F03ceEbF4A372a390d24" },
    mBTC: { address: "0x007115416AB6c266329a03B09a8aa39aC2eF7d9d", oracle: "0xA537EF0343e83761ED42B8E017a1e495c9a189Ee" },
    mEDGE: { address: "0xbB51E2a15A9158EBE2b0Ceb8678511e063AB7a55", oracle: "0x698dA5D987a71b68EbF30C1555cfd38F190406b7" },
    mMEV: { address: "0x030b69280892c888670EDCDCD8B69Fd8026A0BF3", oracle: "0x5f09Aff8B9b1f488B7d1bbaD4D89648579e55d61" },
    mAPOLLO: { address: "0x7CF9DEC92ca9FD46f8d86e7798B72624Bc116C05", oracle: "0x84303e5568C7B167fa4fEBc6253CDdfe12b7Ee4B" },
    msyrupUSD: { address: "0x20226607b4fa64228ABf3072Ce561d6257683464", oracle: "0x41c60765fA36109b19B21719F4593F19dDeFa663" },
    msyrupUSDp: { address: "0x2fE058CcF29f123f9dd2aEC0418AA66a877d8E50", oracle: "0x337d914ff6622510FC2C63ac59c1D07983895241" },
    mRe7YIELD: { address: "0x87C9053C819bB28e0D73d33059E1b3DA80AFb0cf", oracle: "0x0a2a51f2f206447dE3E3a80FCf92240244722395" },
    mRe7BTC: { address: "0x9FB442d6B612a6dcD2acC67bb53771eF1D9F661A", oracle: "0x9de073685AEb382B7c6Dd0FB93fa0AEF80eB8967" },
    mFARM: { address: "0xA19f6e0dF08a7917F2F8A33Db66D0AF31fF5ECA6", oracle: "0x65df7299A9010E399A38d6B7159d25239cDF039b" },
    mHYPER: { address: "0x9b5528528656DBC094765E2abB79F293c21191B9", oracle: "0x43881B05C3BE68B2d33eb70aDdF9F666C5005f68" },
    mFONE: { address: "0x238a700eD6165261Cf8b2e544ba797BC11e466Ba", oracle: "0x8D51DBC85cEef637c97D02bdaAbb5E274850e68C" },
    mEVUSD: { address: "0x548857309BEfb6Fb6F20a9C5A56c9023D892785B", oracle: "0x6f51d8aF5bE2cF3517B8d6Cd07361bE382E83be6" },
    mHyperETH: { address: "0x5a42864b14C0C8241EF5ab62Dae975b163a2E0C1", oracle: "0x5C81ee2C3Ee8AaAC2eEF68Ecb512472D9E08A0fd", denomination: "ETH" },
    mHyperBTC: { address: "0xC8495EAFf71D3A563b906295fCF2f685b1783085", oracle: "0x3359921992C33ef23169193a6C91F2944A82517C", denomination: "BTC" },
    mevBTC: { address: "0xb64C014307622eB15046C66fF71D04258F5963DC", oracle: "0xffd462e0602Dd9FF3F038fd4e77a533f8c474b65" },
    mM1USD: { address: "0xCc5C22C7A6BCC25e66726AeF011dDE74289ED203", oracle: "0xad316aA927c0970C2e8f0B903211D0bd19A10702" },
    mROX: { address: "0x67E1F506B148d0Fc95a4E3fFb49068ceB6855c05", oracle: "0x7fF56C3a31476c231e74E4F64e9d9718572B54Aa" },
    mGLOBAL: { address: "0x7433806912Eae67919e66aea853d46Fa0aef98A8", oracle: "0x66Aa9fcD63DF74e1f67A9452E6E59Fbc67f75E38" },
  },
  [CHAIN.BASE]: {
    mTBILL: { address: "0xDD629E5241CbC5919847783e6C96B2De4754e438", oracle: "0x70E58b7A1c884fFFE7dbce5249337603a28b8422" },
    mBASIS: { address: "0x1C2757c1FeF1038428b5bEF062495ce94BBe92b2", oracle: "0x6d62D3C3C8f9912890788b50299bF4D2C64823b6" },
    mEVUSD: { address: "0xccbad2823328BCcAEa6476Df3Aa529316aB7474A", oracle: "0x4Fe7f62B2F4eF077aEd8f458c8B4652f5dE8080f" },
  },
  [CHAIN.OPTIMISM]: {
    mRe7ETH: { address: "0xE7Ba07519dFA06e60059563F484d6090dedF21B3", oracle: "0xcFfe26979e96B9E0454cC83aa03FC973C9Eb0E5E", denomination: "ETH" },
  },
  [CHAIN.PLUME]: {
    mTBILL: { address: "0xE85f2B707Ec5Ae8e07238F99562264f304E30109", oracle: "0xb701ABEA3E4b6EAdAc4F56696904c5F551d2617b" },
    mBASIS: { address: "0x0c78Ca789e826fE339dE61934896F5D170b66d78", oracle: "0x01D169AAB1aB4239D5cE491860a65Ba832F72ef2" },
    mEDGE: { address: "0x69020311836D29BA7d38C1D3578736fD3dED03ED", oracle: "0x7D5622Aa8Cc259Ae39fBA51f3C1849797FB7e82D" },
    mMEV: { address: "0x7d611dC23267F508DE90724731Dc88CA28Ef7473", oracle: "0x4e5B43C9c8B7299fd5C7410b18e3c0B718852061" },
  },
  [CHAIN.ETHERLINK]: {
    mTBILL: { address: "0xDD629E5241CbC5919847783e6C96B2De4754e438", oracle: "0x80dA45b66c4CBaB140aE53c9accB01BE4F41B7Dd" },
    mBASIS: { address: "0x2247B5A46BB79421a314aB0f0b67fFd11dd37Ee4", oracle: "0x31D211312D9cF5A67436517C324504ebd5BD50a0" },
    mMEV: { address: "0x5542F82389b76C23f5848268893234d8A63fd5c8", oracle: "0x077670B2138Cc23f9a9d0c735c3ae1D4747Bb516" },
    mRe7YIELD: { address: "0x733d504435a49FC8C4e9759e756C2846c92f0160", oracle: "0x1989329b72C1C81E5460481671298A5a046f3B8E" },
  },
  [CHAIN.ROOTSTOCK]: {
    mTBILL: { address: "0xDD629E5241CbC5919847783e6C96B2De4754e438", oracle: "0x0Ca36aF4915a73DAF06912dd256B8a4737131AE7" },
    mBTC: { address: "0xEF85254Aa4a8490bcC9C02Ae38513Cae8303FB53", oracle: "0xa167BFbeEB48815EfB3E3393d91EC586c2421821" },
    mHyperBTC: { address: "0x7F71f02aE0945364F658860d67dbc10c86Ca3a3C", oracle: "0xf940A175794fe571fD6e45d8C4f57c642C978827", denomination: "BTC" },
  },
  [CHAIN.SAPPHIRE]: {
    mTBILL: { address: "0xDD629E5241CbC5919847783e6C96B2De4754e438", oracle: "0xF76d11D4473EA49a420460B72798fc3B38D4d0CF" },
  },
  [CHAIN.OG]: {
    mEDGE: { address: "0xA1027783fC183A150126b094037A5Eb2F5dB30BA", oracle: "0xC0a696cB0B56f6Eb20Ba7629B54356B0DF245447" },
  },
  [CHAIN.MONAD]: {
    mEDGE: { address: "0x1c8eE940B654bFCeD403f2A44C1603d5be0F50Fa", oracle: "0x33F3cd52C55416ca2eAc184b62FA7481af88271d" },
    mHYPER: { address: "0xd90F6bFEd23fFDE40106FC4498DD2e9EDB95E4e7", oracle: "0xf3BBD544F8453eE82211709422d8d7906f816584" },
    mHyperBTC: { address: "0xF7Cf282eC810fDed974F99c0163E792f432892BC", oracle: "0x165d2E3C0A368988F497F649B6fe2134bE20FD8c", denomination: "BTC" },
  },
  [CHAIN.PLASMA]: {
    mHYPER: { address: "0xb31BeA5c2a43f942a3800558B1aa25978da75F8a", oracle: "0xfC3E47c4Da8F3a01ac76c3C5ecfBfC302e1A08F0" },
  },
  [CHAIN.KATANA]: {
    mRe7SOL: { address: "0xC6135d59F8D10c9C035963ce9037B3635170D716", oracle: "0x3E4b4b3Aed4c51a6652cdB96732AC98c37b9837B" },
    mHYPER: { address: "0x926a8a63Fa1e1FDBBEb811a0319933B1A0F1EDbb", oracle: "0x2cd29cEB7354651Dc5417c5b4D201a1B7DBE4a8C" },
  },
  [CHAIN.TAC]: {
    mRe7YIELD: { address: "0x0a72ED3C34352Ab2dd912b30f2252638C873D6f0", oracle: "0xBbA185027F6c62dac2d7f95CD582785e22d61738" },
  },
  [CHAIN.XRPL_EVM]: {
    mXRP: { address: "0x06e0B0F1A644Bb9881f675Ef266CeC15a63a3d47", oracle: "0xFF64785Ee22D764F8E79812102d3Fa7f2d3437Af" },
  },
  [CHAIN.BSC]: {
    mXRP: { address: "0xc8739fbBd54C587a2ad43b50CbcC30ae34FE9e34", oracle: "0x3BdE0b7B59769Ec00c44C77090D88feB4516E731" },
  },
};

const fetch = async (options: FetchOptions) => {
  const { chain, createBalances, fromApi, toApi, api } = options;
  const dailyFees = createBalances();
  const tokens = config[chain];

  const tokenList = Object.values(tokens);
  const addresses = tokenList.map((t) => t.address);
  const oracles = tokenList.map((t) => t.oracle);

  let supplies: any[], pricesBefore: any[], pricesAfter: any[];
  try {
    [supplies, pricesBefore, pricesAfter] = await Promise.all([
      api.multiCall({ abi: totalSupplyAbi, calls: addresses, permitFailure: true }),
      fromApi.multiCall({ abi: oracleAbi, calls: oracles, permitFailure: true }),
      toApi.multiCall({ abi: oracleAbi, calls: oracles, permitFailure: true }),
    ]);
  } catch {
    return { dailyFees, dailyRevenue: dailyFees, dailySupplySideRevenue: dailyFees };
  }

  tokenList.forEach((token, i) => {
    const supply = supplies[i];
    const priceBefore = pricesBefore[i];
    const priceAfter = pricesAfter[i];
    if (!supply || !priceBefore || !priceAfter) return;

    const priceChange = Number(priceAfter) - Number(priceBefore);
    if (priceChange <= 0) return;

    const dailyYield = (Number(supply) / 1e18) * (priceChange / 1e8);
    if (token.denomination) {
      dailyFees.addCGToken(denominationCGId[token.denomination], dailyYield);
    } else {
      dailyFees.addUSDValue(dailyYield);
    }
  });

  return {
    dailyFees,
    //dailyRevenue: dailyFees,
    //dailySupplySideRevenue: dailyFees,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: Object.fromEntries(
    Object.keys(config).map((chain) => [chain, { fetch, start: "2024-07-01" }])
  ),
  methodology: {
    Fees: "Yield accrued to mToken holders from underlying RWA assets, calculated from daily oracle price changes of each mToken.",
  },
};

export default adapter;

