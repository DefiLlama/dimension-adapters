import { FetchOptions, FetchResultV2, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";

type ProductConfig = {
  mToken: string;
  oracle?: string;
  issuanceVault?: string;
  instantRedemptionVault?: string;
  standardRedemptionVault?: string;
  redemptionVault?: string;
};

const CONFIG: Record<string, ProductConfig[]> = {
  [CHAIN.ETHEREUM]: [
    {
      mToken: "0xdd629e5241cbc5919847783e6c96b2de4754e438", // mTBILL
      oracle: "0x056339C044055819E8Db84E71f5f2E1F536b2E5b",
      issuanceVault: "0x99361435420711723aF805F08187c9E6bF796683",
      standardRedemptionVault: "0xF6e51d24F4793Ac5e71e0502213a9BBE3A6d4517",
      instantRedemptionVault: "0x569D7dccBF6923350521ecBC28A555A500c4f0Ec",
    },
    {
      mToken: "0x2a8c22E3b10036f3AEF5875d04f8441d4188b656", // mBASIS
      oracle: "0xE4f2AE539442e1D3Fb40F03ceEbF4A372a390d24",
      issuanceVault: "0xa8a5c4FF4c86a459EBbDC39c5BE77833B3A15d88",
      standardRedemptionVault: "0x19AB19e61A930bc5C7B75Bf06cDd954218Ca9F0b",
      instantRedemptionVault: "0x0D89C1C4799353F3805A3E6C4e1Cbbb83217D123",
    },
    {
      mToken: "0x007115416AB6c266329a03B09a8aa39aC2eF7d9d", // mBTC
      oracle: "0xA537EF0343e83761ED42B8E017a1e495c9a189Ee",
      issuanceVault: "0x10cC8dbcA90Db7606013d8CD2E77eb024dF693bD",
      redemptionVault: "0x30d9D1e76869516AEa980390494AaEd45C3EfC1a",
    },
    {
      mToken: "0xbB51E2a15A9158EBE2b0Ceb8678511e063AB7a55", // mEDGE
      oracle: "0x698dA5D987a71b68EbF30C1555cfd38F190406b7",
      issuanceVault: "0xfE8de16F2663c61187C1e15Fb04D773E6ac668CC",
      redemptionVault: "0x9B2C5E30E3B1F6369FC746A1C1E47277396aF15D",
    },
    {
      mToken: "0xb64C014307622eB15046C66fF71D04258F5963DC", // mevBTC
      oracle: "0xffd462e0602Dd9FF3F038fd4e77a533f8c474b65",
      issuanceVault: "0xA6d60A71844bc134f4303F5E40169D817b491E37",
      redemptionVault: "0x2d7d5b1706653796602617350571B3F8999B950c",
    },
    {
      mToken: "0x030b69280892c888670EDCDCD8B69Fd8026A0BF3", // mMEV
      oracle: "0x5f09Aff8B9b1f488B7d1bbaD4D89648579e55d61",
      issuanceVault: "0xE092737D412E0B290380F9c8548cB5A58174704f",
      redemptionVault: "0xac14a14f578C143625Fc8F54218911e8F634184D",
    },
    {
      mToken: "0x87C9053C819bB28e0D73d33059E1b3DA80AFb0cf", // mRe7YIELD
      oracle: "0x0a2a51f2f206447dE3E3a80FCf92240244722395",
      issuanceVault: "0xcE0A2953a5d46400Af601a9857235312d1924aC7",
      redemptionVault: "0x5356B8E06589DE894D86B24F4079c629E8565234",
    },
    {
      mToken: "0x9FB442d6B612a6dcD2acC67bb53771eF1D9F661A", // mRe7BTC
      oracle: "0x9de073685AEb382B7c6Dd0FB93fa0AEF80eB8967",
      issuanceVault: "0x5E154946561AEA4E750AAc6DeaD23D37e00E47f6",
      redemptionVault: "0x4Fd4DD7171D14e5bD93025ec35374d2b9b4321b0",
    },
    {
      mToken: "0x238a700eD6165261Cf8b2e544ba797BC11e466Ba", // mFONE
      oracle: "0x8D51DBC85cEef637c97D02bdaAbb5E274850e68C",
      issuanceVault: "0x41438435c20B1C2f1fcA702d387889F346A0C3DE",
      redemptionVault: "0x44b0440e35c596e858cEA433D0d82F5a985fD19C",
    },
    {
      mToken: "0x20226607b4fa64228ABf3072Ce561d6257683464", // msyrupUSD
      oracle: "0x41c60765fA36109b19B21719F4593F19dDeFa663",
      issuanceVault: "0x5AE23D23B7986a708CBA9bF808aD9A43BF77d1b7",
      redemptionVault: "0x9f7dd5462C183B6577858e16a13A4d864CE2f972",
    },
    {
      mToken: "0x2fE058CcF29f123f9dd2aEC0418AA66a877d8E50", // msyrupUSDp
      oracle: "0x337d914ff6622510FC2C63ac59c1D07983895241",
      issuanceVault: "0x8493f1f2B834c2837C87075b0EdAc17f5273789a",
      redemptionVault: "0x71EFa7AF1686C5c04AA34a120a91cb4262679C44",
    },
    {
      mToken: "0x7CF9DEC92ca9FD46f8d86e7798B72624Bc116C05", // mAPOLLO
      oracle: "0x84303e5568C7B167fa4fEBc6253CDdfe12b7Ee4B",
      issuanceVault: "0xc21511EDd1E6eCdc36e8aD4c82117033e50D5921",
      redemptionVault: "0x5aeA6D35ED7B3B7aE78694B7da2Ee880756Af5C0",
    },
    {
      mToken: "0xA19f6e0dF08a7917F2F8A33Db66D0AF31fF5ECA6", // mFARM
      oracle: "0x65df7299A9010E399A38d6B7159d25239cDF039b",
      issuanceVault: "0x695fb34B07a8cEc2411B1bb519fD8F1731850c81",
      redemptionVault: "0xf4F042D90f0C0d3ABA4A30Caa6Ac124B14A7e600",
    },
    {
      mToken: "0x9b5528528656DBC094765E2abB79F293c21191B9", // mHYPER
      oracle: "0x43881B05C3BE68B2d33eb70aDdF9F666C5005f68",
      issuanceVault: "0xbA9FD2850965053Ffab368Df8AA7eD2486f11024",
      redemptionVault: "0x6Be2f55816efd0d91f52720f096006d63c366e98",
    },
    {
      mToken: "0x5a42864b14C0C8241EF5ab62Dae975b163a2E0C1", // mHyperETH
      oracle: "0x5C81ee2C3Ee8AaAC2eEF68Ecb512472D9E08A0fd",
      issuanceVault: "0x57B3Be350C777892611CEdC93BCf8c099A9Ecdab",
      redemptionVault: "0x15f724b35A75F0c28F352b952eA9D1b24e348c57",
    },
    {
      mToken: "0xC8495EAFf71D3A563b906295fCF2f685b1783085", // mHyperBTC
      oracle: "0x3359921992C33ef23169193a6C91F2944A82517C",
      issuanceVault: "0xeD22A9861C6eDd4f1292aeAb1E44661D5f3FE65e",
      redemptionVault: "0x16d4f955B0aA1b1570Fe3e9bB2f8c19C407cdb67",
    },
    {
      mToken: "0x605A84861EE603e385b01B9048BEa6A86118DB0a", // mWildUSD
      oracle: "0xb70eCe4F1a87c419E1082691Bb9a49eb7CaAe6a6",
      issuanceVault: "0xd252EB9d448dB3A46d9c1476A7eb45E5c0CED7C2",
      redemptionVault: "0x2f98A13635F6CEc0cc45bC1e43969C71d68091d6",
    },
    {
      mToken: "0x67E1F506B148d0Fc95a4E3fFb49068ceB6855c05", // mROX
      oracle: "0x7fF56C3a31476c231e74E4F64e9d9718572B54Aa",
      issuanceVault: "0x511d88E64d843Ee11Bf039a3EB837393001aEDE7",
      redemptionVault: "0xc33dAdA688f224c514682Ec6Ba940888d43C4b29",
    },
    {
      mToken: "0x7433806912Eae67919e66aea853d46Fa0aef98A8", // mGLOBAL
      oracle: "0x66Aa9fcD63DF74e1f67A9452E6E59Fbc67f75E38",
      issuanceVault: "0xCe29c36c6D4556f2d01d79414C1354B968dDDEf1",
      standardRedemptionVault: "0x1e0fd66753198c7b8bA64edEe8d41D8628Bf20D7",
      redemptionVault: "0xA0Fc8BDFb1E6a705C1375810989B1d70a982b01B",
    },
  ],
  [CHAIN.BASE]: [
    {
      mToken: "0xDD629E5241CbC5919847783e6C96B2De4754e438", // mTBILL
      oracle: "0x70E58b7A1c884fFFE7dbce5249337603a28b8422",
      issuanceVault: "0x8978e327FE7C72Fa4eaF4649C23147E279ae1470",
      instantRedemptionVault: "0x2a8c22E3b10036f3AEF5875d04f8441d4188b656",
    },
    {
      mToken: "0x1C2757c1FeF1038428b5bEF062495ce94BBe92b2", // mBASIS
      oracle: "0x6d62D3C3C8f9912890788b50299bF4D2C64823b6",
      issuanceVault: "0x80b666D60293217661E7382737bb3E42348f7CE5",
      instantRedemptionVault: "0xF804a646C034749b5484bF7dfE875F6A4F969840",
    },
  ],
  [CHAIN.OASIS]: [
    {
      mToken: "0xDD629E5241CbC5919847783e6C96B2De4754e438", // mTBILL
      oracle: "0xF76d11D4473EA49a420460B72798fc3B38D4d0CF",
      issuanceVault: "0xD7Fe0e91C05CAfdd26dA4B176eEc2b883795BDcC",
      instantRedemptionVault: "0xf939E88ecAd43115116c7106DfdbdC4b1315a7Ee",
    },
  ],
  [CHAIN.PLUME]: [
    {
      mToken: "0xE85f2B707Ec5Ae8e07238F99562264f304E30109", // mTBILL
      oracle: "0xb701ABEA3E4b6EAdAc4F56696904c5F551d2617b",
      issuanceVault: "0xb05F6aa8C2ea9aB8537cF09A9B765a21De249224",
      instantRedemptionVault: "0x3aC6b2Bf09f470e5674C3DA60Be7D2DA2791F897",
    },
    {
      mToken: "0x69020311836D29BA7d38C1D3578736fD3dED03ED", // mEDGE
      oracle: "0x7D5622Aa8Cc259Ae39fBA51f3C1849797FB7e82D",
      issuanceVault: "0x23dE49C9ECb8bAaF4aBDeD123FaFbb7D5b7a0eE2",
      redemptionVault: "0xC874394Cd67F7de462eb5c25889beC9744Bc0F80",
    },
    {
      mToken: "0x0c78Ca789e826fE339dE61934896F5D170b66d78", // mBASIS
      oracle: "0x01D169AAB1aB4239D5cE491860a65Ba832F72ef2",
      issuanceVault: "0x8F38A24d064B41c990a3f47439a7a7EE713BF8Dc",
      instantRedemptionVault: "0x9B0d0bDAE237116F711E8C9d900B5dDCC8eF8B5D",
    },
    {
      mToken: "0x7d611dC23267F508DE90724731Dc88CA28Ef7473", // mMEV
      oracle: "0x4e5B43C9c8B7299fd5C7410b18e3c0B718852061",
      issuanceVault: "0xe6F0C60Fca2bd97d633a3D9D49DBEFDF19636D8c",
      redemptionVault: "0x331Af8984d9f10C5173E69537F41313996e7C3Cc",
    },
  ],
  [CHAIN.ETHERLINK]: [
    {
      mToken: "0xDD629E5241CbC5919847783e6C96B2De4754e438", // mTBILL
      oracle: "0x80dA45b66c4CBaB140aE53c9accB01BE4F41B7Dd",
      issuanceVault: "0xd65BFeB71271A4408ff335E59eCf6c5b21A33a70",
      instantRedemptionVault: "0x7f938d26b6179A96870afaECfB0578110E53A3b2",
    },
    {
      mToken: "0x2247B5A46BB79421a314aB0f0b67fFd11dd37Ee4", // mBASIS
      oracle: "0x31D211312D9cF5A67436517C324504ebd5BD50a0",
      issuanceVault: "0x75C32818ce59D913f9E2aeDEcd5697566Ff9aE4A",
      instantRedemptionVault: "0x02e58De067a0c63B3656D7e1DF9ECBCbc9E5ffC6",
    },
    {
      mToken: "0x5542F82389b76C23f5848268893234d8A63fd5c8", // mMEV
      oracle: "0x077670B2138Cc23f9a9d0c735c3ae1D4747Bb516",
      issuanceVault: "0x577617613C4FaC5A7561F8f3F2Cb128A560774Bc",
      redemptionVault: "0x403a92A980903707FD8A3A1101f48Eb3ebd58166",
    },
    {
      mToken: "0x733d504435a49FC8C4e9759e756C2846c92f0160", // mRe7YIELD
      oracle: "0x1989329b72C1C81E5460481671298A5a046f3B8E",
      issuanceVault: "0xBEf85e71EcD0517D0C1446751667891b04860753",
      redemptionVault: "0xb24056AE566e24E35De798880E2dC28e2130De90",
    },
  ],
  [CHAIN.OPTIMISM]: [
    {
      mToken: "0xE7Ba07519dFA06e60059563F484d6090dedF21B3", // mRe7ETH
      oracle: "0xcFfe26979e96B9E0454cC83aa03FC973C9Eb0E5E",
      issuanceVault: "0xC562F73ADD198ce47E9Af5B0752dE3D7c991225D",
      redemptionVault: "0x2c8AEe33a6B1eBDd047903B5FDe01D71B8854e6D",
    },
  ],
  [CHAIN.TAC]: [
    {
      mToken: "0x0a72ED3C34352Ab2dd912b30f2252638C873D6f0", // mRe7YIELD
      oracle: "0xBbA185027F6c62dac2d7f95CD582785e22d61738",
      issuanceVault: "0xbD2CE9D5F2c682FCA3ce587Bf1C041ad8DDd2a69",
      redemptionVault: "0x911f9aF9138284A49b29F9894571Fb86e29D1d79",
    },
  ],
  [CHAIN.ROOTSTOCK]: [
    {
      mToken: "0xDD629E5241CbC5919847783e6C96B2De4754e438", // mTBILL
      oracle: "0x0Ca36aF4915a73DAF06912dd256B8a4737131AE7",
      issuanceVault: "0xf454A52DA2157686Ef99702C0C19c0E8D66bC03c",
      instantRedemptionVault: "0x99D22115Fd6706B78703fF015DE897d43667D12F",
    },
    {
      mToken: "0xEF85254Aa4a8490bcC9C02Ae38513Cae8303FB53", // mBTC
      oracle: "0xa167BFbeEB48815EfB3E3393d91EC586c2421821",
      issuanceVault: "0x79A15707E2766d486681569Bd1041821f5e32998",
      redemptionVault: "0xe7a1A676D0CCA2e20A69adD500985C7271a40205",
    },
  ],
  [CHAIN.BSC]: [
    {
      mToken: "0xc8739fbBd54C587a2ad43b50CbcC30ae34FE9e34", // mXRP
      oracle: "0x3BdE0b7B59769Ec00c44C77090D88feB4516E731",
      issuanceVault: "0x30B59844eC16ABA3ec4ca0BD97557CcB670D924E",
      redemptionVault: "0x73685BD72dF34B92Bc81D43ef35CFf4300DE8625",
    },
  ],
  [CHAIN.XRPL_EVM]: [
    {
      mToken: "0x06e0B0F1A644Bb9881f675Ef266CeC15a63a3d47", // mXRP
      oracle: "0xFF64785Ee22D764F8E79812102d3Fa7f2d3437Af",
      issuanceVault: "0x30FBc82A72CA674AA250cd6c27BCca1Fe602f1Bb",
      redemptionVault: "0xDaC1b058cE42b67Ba33DbfDBA972d76C83C085D6",
    },
  ],
  [CHAIN.KATANA]: [
    {
      mToken: "0xC6135d59F8D10c9C035963ce9037B3635170D716", // mRe7SOL
      oracle: "0x3E4b4b3Aed4c51a6652cdB96732AC98c37b9837B",
      issuanceVault: "0x175A9b122bf22ac2b193a0A775D7370D5A75268E",
      redemptionVault: "0xE93E6Cf151588d63bB669138277D20f28C2E7cdA",
    },
  ],
  [CHAIN.PLASMA]: [
    {
      mToken: "0xb31BeA5c2a43f942a3800558B1aa25978da75F8a", // mHYPER
      oracle: "0xfC3E47c4Da8F3a01ac76c3C5ecfBfC302e1A08F0",
      issuanceVault: "0xa603cf264aDEB8E7f0f063C116929ADAC2D4286E",
      redemptionVault: "0x880661F9b412065D616890cA458dcCd0146cb77C",
    },
  ],
  [CHAIN.MONAD]: [
    {
      mToken: "0x1c8eE940B654bFCeD403f2A44C1603d5be0F50Fa", // mEDGE
      oracle: "0x33F3cd52C55416ca2eAc184b62FA7481af88271d",
      issuanceVault: "0xdF7dEb47635AF76Da5e455C6b0F4E26222326FD9",
      redemptionVault: "0x2Ce347dECFc8dAB433c4EB6CA171747E5a82c332",
    },
  ],
  [CHAIN.OG]: [
    {
      mToken: "0xA1027783fC183A150126b094037A5Eb2F5dB30BA", // mEDGE
      oracle: "0xC0a696cB0B56f6Eb20Ba7629B54356B0DF245447",
      issuanceVault: "0x72a93168AE79F269DeB2b1892F2AFd7eaa800271",
      redemptionVault: "0x9dae503014edc48A4d8FE789f22c70Ae650eb79B",
    },
  ],
};

const ABI = {
  redeemInstant:
    "event RedeemInstant(address indexed user, address indexed tokenOut, uint256 amount, uint256 feeAmount, uint256 amountTokenOut)",
  redeemInstantWithCustomRecipient:
    "event RedeemInstantWithCustomRecipient(address indexed user, address indexed tokenOut, address indexed recipient, uint256 amount, uint256 feeAmount, uint256 amountTokenOut)",
  depositInstant:
    "event DepositInstant(address indexed user, address indexed tokenIn, uint256 amountUsd, uint256 amountToken, uint256 fee, uint256 minted, bytes32 referrerId)",
  latestRoundData:
    "function latestRoundData() view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)",
  decimals: "uint8:decimals",
};

type FeeLog = {
  address: string;
  feeAmount: bigint;
  token?: string;
};

type ResolvedProduct = ProductConfig & {
  mToken: string;
  oracle: string;
};

const MAX_DAILY_NAV_GROWTH_BPS = 100n; // 1% daily move ceiling for APY/NAV accrual sanity
const PRODUCT_ADDRESS_KEYS = [
  "mToken",
  "oracle",
  "issuanceVault",
  "instantRedemptionVault",
  "standardRedemptionVault",
  "redemptionVault",
] as const;

function toAddress(value: unknown): string {
  return String(value).toLowerCase();
}

function toBigInt(value: unknown): bigint {
  return typeof value === "bigint" ? value : BigInt(String(value));
}

function normalizeFeeLog(log: any, feeKey: string, tokenKey?: string): FeeLog | null {
  const args = log?.args ?? log;
  const feeAmount = args?.[feeKey];
  const address = log?.address;
  if (feeAmount === undefined || !address) return null;

  return {
    address: toAddress(address),
    feeAmount: toBigInt(feeAmount),
    token: tokenKey && args?.[tokenKey] ? toAddress(args[tokenKey]) : undefined,
  };
}

function formatUnits(value: bigint, decimals: number): number {
  const base = 10n ** BigInt(decimals);
  const whole = value / base;
  const fraction = value % base;
  return Number(whole) + Number(fraction) / Number(base);
}

function getProductAddresses(product: ProductConfig | ResolvedProduct): string[] {
  return PRODUCT_ADDRESS_KEYS.map((key) => product[key]).filter(Boolean) as string[];
}

function buildChainData(chain: string) {
  const products = (CONFIG[chain] ?? [])
    .filter((product) => !!product.oracle)
    .map((product) => ({
      ...product,
      mToken: toAddress(product.mToken),
      oracle: toAddress(product.oracle!),
    })) as ResolvedProduct[];
  const targets = new Set<string>();
  const addressToProduct: Record<string, ResolvedProduct> = {};
  const conflictedAddresses = new Set<string>();

  for (const product of products) {
    const addresses = getProductAddresses(product);
    addresses.forEach((address) => targets.add(toAddress(address)));

    addresses.forEach((address) => {
      const normalizedAddress = toAddress(address);
      const existing = addressToProduct[normalizedAddress];
      if (!existing) {
        addressToProduct[normalizedAddress] = product;
        return;
      }

      if (existing.mToken !== product.mToken || existing.oracle !== product.oracle) {
        conflictedAddresses.add(normalizedAddress);
      }
    });
  }

  // If docs/config map the same on-chain address to multiple products, skip
  // address-based attribution for that address rather than guessing.
  conflictedAddresses.forEach((address) => delete addressToProduct[address]);
  return { products, targets: [...targets], addressToProduct };
}

async function safeCall(api: any, target: string, abi: string): Promise<any | null> {
  try {
    return await api.call({ target, abi, permitFailure: true });
  } catch {
    return null;
  }
}

async function safeMultiCall(api: any, params: { abi: string; calls: any[]; permitFailure: true }): Promise<any[]> {
  try {
    return await api.multiCall(params);
  } catch {
    return new Array(params.calls.length).fill(null);
  }
}

function getOracleAnswer(raw: any): bigint | null {
  if (!raw) return null;
  const answer = Array.isArray(raw) ? raw[1] : raw?.answer;
  if (answer === undefined || answer === null) return null;
  const parsed = toBigInt(answer);
  return parsed > 0n ? parsed : null;
}

// DepositInstant.fee is emitted in protocol-normalized base-18 precision, so we
// rescale it into the deposited token's native decimals before booking balances.
function scaleFromBase18(value: bigint, decimals: number): bigint {
  if (decimals === 18) return value;
  if (decimals < 18) return value / 10n ** BigInt(18 - decimals);
  return value * 10n ** BigInt(decimals - 18);
}

async function loadCurrentOracleState(api: any, products: ResolvedProduct[]) {
  const oracleRateMap: Record<string, bigint> = {};
  const oracleDecimalsMap: Record<string, number> = {};
  const mTokenDecimalsMap: Record<string, number> = {};
  const uniqueOracles = [...new Set(products.map((product) => product.oracle))];
  const uniqueMTokens = [...new Set(products.map((product) => product.mToken))];

  // Pull live precision from both the NAV oracles and the mTokens so fee/yield
  // math never relies on a hardcoded decimal assumption.
  const [ratesAfter, oracleDecimals, mTokenDecimals] = await Promise.all([
    safeMultiCall(api, { abi: ABI.latestRoundData, calls: uniqueOracles, permitFailure: true }),
    safeMultiCall(api, { abi: ABI.decimals, calls: uniqueOracles, permitFailure: true }),
    safeMultiCall(api, { abi: ABI.decimals, calls: uniqueMTokens, permitFailure: true }),
  ]);

  uniqueOracles.forEach((oracle, index) => {
    const rate = getOracleAnswer(ratesAfter[index]);
    const rawDecimals = oracleDecimals[index];
    const decimals = rawDecimals === null || rawDecimals === undefined ? undefined : Number(rawDecimals);
    if (decimals !== undefined && Number.isFinite(decimals))
      oracleDecimalsMap[oracle] = decimals;
    if (rate) oracleRateMap[oracle] = rate;
  });

  uniqueMTokens.forEach((mToken, index) => {
    const decimals = mTokenDecimals[index];
    if (decimals !== null && decimals !== undefined && Number.isFinite(Number(decimals)))
      mTokenDecimalsMap[mToken] = Number(decimals);
  });

  return { oracleRateMap, oracleDecimalsMap, mTokenDecimalsMap };
}

function createEmptyResult(options: FetchOptions): FetchResultV2 {
  return {
    dailyFees: options.createBalances(),
    dailyRevenue: options.createBalances(),
    dailyProtocolRevenue: options.createBalances(),
    dailySupplySideRevenue: options.createBalances(),
  };
}

async function addSupplySideYield(
  options: FetchOptions,
  products: ResolvedProduct[],
  oracleRateMap: Record<string, bigint>,
  oracleDecimalsMap: Record<string, number>,
  mTokenDecimalsMap: Record<string, number>,
  dailyFees: any,
  dailySupplySideRevenue: any,
) {
  const snapshots = await Promise.all(
    products.map(async (product) => ({
      product,
      supplyBefore: await safeCall(options.fromApi, product.mToken, "uint256:totalSupply"),
      rateBefore: getOracleAnswer(await safeCall(options.fromApi, product.oracle, ABI.latestRoundData)),
    })),
  );

  snapshots.forEach(({ product, supplyBefore, rateBefore }) => {
    const rateAfter = oracleRateMap[product.oracle];
    const decimals = oracleDecimalsMap[product.oracle];
    const mTokenDecimals = mTokenDecimalsMap[product.mToken];
    if (!supplyBefore || !rateBefore || !rateAfter || decimals === undefined || mTokenDecimals === undefined) return;
    if (rateAfter <= rateBefore) return;

    // Oracle glitches can produce unrealistic day-over-day jumps; skip those
    // rather than letting one bad feed dominate daily yield.
    const growthBps = ((rateAfter - rateBefore) * 10_000n) / rateBefore;
    if (growthBps > MAX_DAILY_NAV_GROWTH_BPS) return;

    const yieldUsd = formatUnits(toBigInt(supplyBefore), mTokenDecimals) * formatUnits(rateAfter - rateBefore, decimals);
    if (!yieldUsd) return;

    dailyFees.addUSDValue(yieldUsd, METRIC.ASSETS_YIELDS);
    dailySupplySideRevenue.addUSDValue(yieldUsd, METRIC.ASSETS_YIELDS);
  });
}

function addInstantFeeLogs(
  logs: any[],
  feeKey: string,
  metric: string,
  addressToProduct: Record<string, ResolvedProduct>,
  oracleRateMap: Record<string, bigint>,
  oracleDecimalsMap: Record<string, number>,
  mTokenDecimalsMap: Record<string, number>,
  dailyFees: any,
  dailyRevenue: any,
  dailyProtocolRevenue: any,
) {
  logs
    .map((log) => normalizeFeeLog(log, feeKey))
    .filter((log): log is FeeLog => !!log && log.feeAmount > 0n)
    .forEach((log) => {
      const product = addressToProduct[log.address];
      if (!product?.oracle) return;
      const rate = oracleRateMap[product.oracle];
      const decimals = oracleDecimalsMap[product.oracle];
      const mTokenDecimals = mTokenDecimalsMap[product.mToken];
      if (!rate || decimals === undefined || mTokenDecimals === undefined) return;

      const feeUsd = formatUnits(log.feeAmount, mTokenDecimals) * formatUnits(rate, decimals);
      if (!feeUsd) return;

      dailyFees.addUSDValue(feeUsd, metric);
      dailyRevenue.addUSDValue(feeUsd, metric);
      dailyProtocolRevenue.addUSDValue(feeUsd, metric);
    });
}

function addDepositFeeLogs(
  logs: any[],
  tokenDecimalsMap: Record<string, number>,
  dailyFees: any,
  dailyRevenue: any,
  dailyProtocolRevenue: any,
) {
  logs
    .map((log) => normalizeFeeLog(log, "fee", "tokenIn"))
    .filter((log): log is FeeLog => !!log && log.feeAmount > 0n && !!log.token)
    .forEach((log) => {
      const decimals = tokenDecimalsMap[log.token!];
      if (decimals === undefined) return;
      const feeAmount = scaleFromBase18(log.feeAmount, decimals);
      if (!feeAmount) return;

      dailyFees.add(log.token!, feeAmount, METRIC.DEPOSIT_WITHDRAW_FEES);
      dailyRevenue.add(log.token!, feeAmount, METRIC.DEPOSIT_WITHDRAW_FEES);
      dailyProtocolRevenue.add(log.token!, feeAmount, METRIC.DEPOSIT_WITHDRAW_FEES);
    });
}

async function fetch(options: FetchOptions): Promise<FetchResultV2> {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const { products, targets, addressToProduct } = buildChainData(options.chain);

  if (!targets.length) {
    return createEmptyResult(options);
  }

  const { oracleRateMap, oracleDecimalsMap, mTokenDecimalsMap } = await loadCurrentOracleState(options.toApi, products);

  try {
    await addSupplySideYield(
      options,
      products,
      oracleRateMap,
      oracleDecimalsMap,
      mTokenDecimalsMap,
      dailyFees,
      dailySupplySideRevenue,
    );
  } catch (error) {
    // best effort: APY/yield should never suppress redeem fee tracking
    console.error(`[midas-rwa] addSupplySideYield failed on ${options.chain}`, error);
  }

  const getLogs = (eventAbi: string) =>
    options.getLogs({
      targets,
      eventAbi,
      entireLog: true,
      parseLog: true,
      flatten: true,
      skipIndexer: false,
    });

  const [instantLogs, customRecipientLogs, depositLogs] = await Promise.all([
    getLogs(ABI.redeemInstant),
    getLogs(ABI.redeemInstantWithCustomRecipient),
    getLogs(ABI.depositInstant),
  ]);

  const depositTokens = [...new Set(
    depositLogs
      .map((log) => normalizeFeeLog(log, "fee", "tokenIn")?.token)
      .filter((token): token is string => !!token),
  )];
  // Deposit fees are booked in tokenIn, so we need token-native decimals before
  // rescaling the base-18 event value into raw token units.
  const depositTokenDecimals = await Promise.all(
    depositTokens.map((token) => safeCall(options.toApi, token, ABI.decimals)),
  );
  const tokenDecimalsMap = Object.fromEntries(
    depositTokens
      .map((token, index) => [token, depositTokenDecimals[index]])
      .filter((entry): entry is [string, number] => entry[1] !== null && entry[1] !== undefined)
      .map(([token, decimals]) => [token, Number(decimals)]),
  );

  addInstantFeeLogs(
    [...instantLogs, ...customRecipientLogs],
    "feeAmount",
    METRIC.MINT_REDEEM_FEES,
    addressToProduct,
    oracleRateMap,
    oracleDecimalsMap,
    mTokenDecimalsMap,
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue,
  );

  addDepositFeeLogs(depositLogs, tokenDecimalsMap, dailyFees, dailyRevenue, dailyProtocolRevenue);

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue,
    dailySupplySideRevenue,
  };
}

function shouldSoftFailInfraError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return [
    "method: getBlock",
    "method: getLogs",
    "eth_getLogs does not exist",
    "Cannot read properties of null (reading 'number')",
    "No RPCs available for oasis",
    "No RPCs available for rsk",
    "Request failed with status code 429",
    "fromBlock or fromTimestamp is required",
    "toBlock or toTimestamp is required",
    "fromBlock and toBlock must be > 0",
    "Error getting block:",
  ].some((needle) => message.includes(needle));
}

async function fetchWithSoftFailure(options: FetchOptions): Promise<FetchResultV2> {
  try {
    return await fetch(options);
  } catch (error) {
    // Only the known Oasis/Rootstock infra failures should degrade to zeros.
    // Everything else should still fail loudly.
    if (!shouldSoftFailInfraError(error)) throw error;
    return createEmptyResult(options);
  }
}

const REDEEM_FEE_DESCRIPTION = "Instant redemption fee values from non-zero RedeemInstant and RedeemInstantWithCustomRecipient logs fetched from configured Midas product addresses.";
const DEPOSIT_FEE_DESCRIPTION = "Instant deposit fee values from non-zero DepositInstant logs fetched from configured Midas product addresses.";
const ASSET_YIELD_DESCRIPTION = "NAV growth of mTokens over the window, expressed as supply-side asset yield.";

const methodology = {
  Fees:
    "Includes non-zero instant deposit and redemption fees plus NAV-based asset yield reflected in mToken APY.",
  Revenue:
    "Protocol revenue equals non-zero instant deposit and redemption fees.",
  ProtocolRevenue:
    "All tracked instant deposit and redemption fee values are counted as protocol revenue.",
  SupplySideRevenue:
    "Supply-side revenue is the NAV growth of mTokens over the window, representing the APY/yield earned by holders.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.MINT_REDEEM_FEES]: REDEEM_FEE_DESCRIPTION,
    [METRIC.DEPOSIT_WITHDRAW_FEES]: DEPOSIT_FEE_DESCRIPTION,
    [METRIC.ASSETS_YIELDS]: ASSET_YIELD_DESCRIPTION,
  },
  Revenue: {
    [METRIC.MINT_REDEEM_FEES]: REDEEM_FEE_DESCRIPTION,
    [METRIC.DEPOSIT_WITHDRAW_FEES]: DEPOSIT_FEE_DESCRIPTION,
  },
  ProtocolRevenue: {
    [METRIC.MINT_REDEEM_FEES]: REDEEM_FEE_DESCRIPTION,
    [METRIC.DEPOSIT_WITHDRAW_FEES]: DEPOSIT_FEE_DESCRIPTION,
  },
  SupplySideRevenue: {
    [METRIC.ASSETS_YIELDS]: ASSET_YIELD_DESCRIPTION,
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [
    CHAIN.ETHEREUM,
    CHAIN.BASE,
    CHAIN.PLUME,
    CHAIN.ETHERLINK,
    CHAIN.OPTIMISM,
    CHAIN.TAC,
    CHAIN.ROOTSTOCK,
    CHAIN.BSC,
    CHAIN.XRPL_EVM,
    CHAIN.KATANA,
    CHAIN.PLASMA,
    CHAIN.MONAD,
    CHAIN.OG,
  ],
  methodology,
  breakdownMethodology,
  adapter: {
    [CHAIN.ETHEREUM]: { start: "2023-12-02", fetch },
    [CHAIN.BASE]: { start: "2025-10-24", fetch },
    // Disabled for now: public Oasis RPC/block lookup is too unstable for reliable daily runs.
    [CHAIN.PLUME]: { start: "2025-05-01", fetch },
    [CHAIN.ETHERLINK]: { start: "2025-02-14", fetch },
    [CHAIN.OPTIMISM]: { start: "2026-04-02", fetch },
    [CHAIN.TAC]: { start: "2026-01-09", fetch: fetchWithSoftFailure },
    [CHAIN.ROOTSTOCK]: { start: "2025-03-01", fetch: fetchWithSoftFailure },
    [CHAIN.BSC]: { start: "2025-10-07", fetch },
    [CHAIN.XRPL_EVM]: { start: "2025-09-10", fetch },
    [CHAIN.KATANA]: { start: "2026-01-27", fetch },
    [CHAIN.PLASMA]: { start: "2025-10-07", fetch },
    [CHAIN.MONAD]: { start: "2025-12-13", fetch },
    [CHAIN.OG]: { start: "2025-09-16", fetch },
  },
};

export default adapter;
