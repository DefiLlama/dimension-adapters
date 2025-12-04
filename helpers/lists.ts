import { httpGet } from "../utils/fetchURL";
import { formatAddress } from "../utils/utils";
import { CHAIN } from "./chains";

const DefaultDexTokensBlacklisted: Record<string, Array<string>> = {
  [CHAIN.ETHEREUM]: [
    "0x044fe33895Cb7c6e4566DA8E24420C1110933a63",
    "0x888888aE2c4A298EFd66D162fFC53b3F2a869888",
    "0xb4357054c3da8d46ed642383f03139ac7f090343", // PORT3 - hacked
  ],
  [CHAIN.BSC]: [
    "0xc71b5f631354be6853efe9c3ab6b9590f8302e81",
    "0xe6df05ce8c8301223373cf5b969afcb1498c5528",
    "0xa0c56a8c0692bd10b3fa8f8ba79cf5332b7107f9",
    "0xb4357054c3da8d46ed642383f03139ac7f090343",
    "0x6bdcce4a559076e37755a78ce0c06214e59e4444",
    "0x87d00066cf131ff54b72b134a217d5401e5392b6",
    "0x30c60b20c25b2810ca524810467a0c342294fc61",
    "0xd82544bf0dfe8385ef8fa34d67e6e4940cc63e16",
    "0x595e21b20e78674f8a64c1566a20b2b316bc3511",
    "0x783c3f003f172c6ac5ac700218a357d2d66ee2a2",
    "0xb9e1fd5a02d3a33b25a14d661414e6ed6954a721",
    "0x95034f653D5D161890836Ad2B6b8cc49D14e029a",
    "0xFf7d6A96ae471BbCD7713aF9CB1fEeB16cf56B41",
    "0xde04da55b74435d7b9f2c5c62d9f1b53929b09aa",
    "0x4fa7c69a7b69f8bc48233024d546bc299d6b03bf",
    "0x27d72484f1910F5d0226aFA4E03742c9cd2B297a",
    "0x6e7573e492f31107Ef98029276922854e919cA28",
    "0xaf44A1E76F56eE12ADBB7ba8acD3CbD474888122",
    "0xb994882a1b9bd98A71Dd6ea5F61577c42848B0E8",
    "0x9e24415d1e549ebc626a13a482bb117a2b43e9cf",
    "0xf2a92bc1cf798ff4de14502a9c6fda58865e8d5d",
    "0x477C2c0459004E3354Ba427FA285D7C053203c0E",
    "0x6CFfFa5bFD4277a04D83307fEedFe2D18D944DD2",
    "0xd5dF4d260D7a0145F655bcBf3B398076F21016C7",
    "0x82ec31d69b3c289e541b50e30681fd1acad24444",
    "0x82Ec31D69b3c289E541b50E30681FD1ACAd24444",
    "0x02e75d28a8aa2a0033b8cf866fcf0bb0e1ee4444",
    "0x4c9027e10c5271efca82379d3123917ae3f2374e",
    "0x3ac8e2c113d5d7824ac6ebe82a3c60b1b9d64444",
    "0x924fa68a0fc644485b8df8abfa0a41c2e7744444",
    "0x810df4c7daf4ee06ae7c621d0680e73a505c9a06",
    "0x302dfaf2cdbe51a18d97186a7384e87cf599877d",
    "0xa3cfb853339b77f385b994799b015cb04b208fe6",
    "0x76e9b54b49739837be8ad10c3687fc6b543de852",
    "0xb4357054c3da8d46ed642383f03139ac7f090343",
  ],
  [CHAIN.ARBITRUM]: [
    "0x2fcAA28BE8549F3953FCf7cae4CC9FBe6Ab2E501",
    "0x3B94Cfdf557f9AAd983fE4E56dd4846958EF708A",
    "0xC1fb38F174D16b1ff46c1CB04b52D5CF157940ee",
    "0x9B34F0cfA7800d21a21BDA50253264e292CBB217",
    "0x560363BdA52BC6A44CA6C8c9B4a5FadbDa32fa60",
    "0xd81Fb17c5A0e6c20BEf8a6a9757a7daf88bfBbbC",
    "0x570F95A4Ac86E2b8EBA86B09d88B1916EF9a39E4",
    "0xc519cE7572EA48b64acbf6BE37a8f9CA39CC5671",
    "0x22B2bA593B6c35Ea3188936CC8502123b7719AaC",
    "0x56ccFe64Cd2420192C5b954b884C9FaD4F667EcF",
    "0x7f70b6b4da3197012128f447482d0c8168A9dA3b",
    "0x845E0f28770E36f4a8DAF3e1d89C6BA3aFFdE345",
    "0xB7e628eB685AeBfa272dfA9C2AA5a6c71d39BCD7",
    "0xfa17041041bF3B19C02C775CC1707C0c5F8E0A44",
    "0x2ba2bA7C299b1c27651FDfb3A830426008663a5A",
    "0xf2224C287c90364391d1fEb4a8eBaadf0b50B774",
    "0x02688Db98424c177672700741454a8CA9e3AE304",
    "0xEAb61ED949a34a32E18359b1A143000406B484B9",
    "0x01538B776363CF6363b0217853082342669825f3",
    "0x0F10f8679d5A417ECd77efDC81EC2EFDB082178D",
    "0x4f8599F84774244E94f66BFF4b14E8C3a431edA3",
    "0x5AF536856E00386cE981FAcb5AF9454Dc389B4AE",
    "0x34890c6cD538c8b1fdbD110b9A5472336F7536c6",
    "0xaa1Aa4da0275f537cfb8729252B775749dDd7eb1",
    "0xbEa03EDB4C8B8d94bcD0993bBde41749e5d71f20",
    "0x3352154E5EDf4DE15304775BBb96d4c2D33C0D10",
    "0x4103e891D0dD3CE3500EFbcC03da4877713728ca",
    "0x33ca9596999f6608Fa3F765aacD98c266207D62E",
    "0x7ed4C778f763f5D68FE688f65499f02FB940745f",
    "0x08a55CF4ad5B770624BD8e087CeDeD413A59dC4F",
    "0x722af8C0A93232e7E2eA3F9eD52a7d8746b95a44",
    "0x3Dd972B41C22794670e17545Ec603F5923FF52d1",
    "0x56649f320fC686143eCcD6f15D3bCE784a968748",
    "0x9D66901b3F8AAEf2CF2AB26Cd51792f6785A159e",
    "0x5f16282E8C95E15667eE6473622517F4E571952e",
    "0xD2D039811384a1A3e13DB498e711DAe3f2BfA542",
    "0xa39052Dbd640e7ad9e8537860C13134D0f432880",
    "0xb8499dbF176de8eCed16c478CFf51997A529F1bE",
  ],
};

export function getDefaultDexTokensBlacklisted(chain: string): Array<string> {
  return DefaultDexTokensBlacklisted[chain]
    ? DefaultDexTokensBlacklisted[chain].map((item) => formatAddress(item))
    : [];
}

export function getAllDexTokensBlacklisted(): Array<string> {
  let bl: Array<string> = [];

  for (const tokens of Object.values(DefaultDexTokensBlacklisted)) {
    bl = bl.concat(tokens.map((item) => formatAddress(item)));
  }

  return bl;
}

interface ChainTokenConfig {
  chainId: number;
  tokenListUrl: string;
}

const ChainConfigs: { [key: string]: ChainTokenConfig } = {
  [CHAIN.ETHEREUM]: {
    chainId: 1,
    tokenListUrl: "https://tokens.coingecko.com/ethereum/all.json",
  },
  [CHAIN.ARBITRUM]: {
    chainId: 42161,
    tokenListUrl:
      "https://raw.githubusercontent.com/sushiswap/list/master/lists/token-lists/default-token-list/tokens/arbitrum.json",
  },
  [CHAIN.BSC]: {
    chainId: 56,
    tokenListUrl:
      "https://raw.githubusercontent.com/pancakeswap/token-list/main/lists/coingecko.json",
  },
  [CHAIN.BASE]: {
    chainId: 8453,
    tokenListUrl:
      "https://raw.githubusercontent.com/sushiswap/list/master/lists/token-lists/default-token-list/tokens/base.json",
  },
  [CHAIN.AVAX]: {
    chainId: 43114,
    tokenListUrl:
      "https://raw.githubusercontent.com/sushiswap/list/master/lists/token-lists/default-token-list/tokens/avalanche.json",
  },
};

export async function getDefaultDexTokensWhitelisted({
  chain,
}: {
  chain: string;
}): Promise<Array<string>> {
  if (ChainConfigs[chain]) {
    const blacklisted = getDefaultDexTokensBlacklisted(chain);
    const data = await httpGet(ChainConfigs[chain].tokenListUrl);
    const tokens = data.tokens ? data.tokens : data;
    return tokens
      .filter(
        (token: any) => Number(token.chainId) === ChainConfigs[chain].chainId,
      )
      .map((token: any) => formatAddress(token.address))
      .filter((token: string) => !blacklisted.includes(token));
  }

  return [];
}
