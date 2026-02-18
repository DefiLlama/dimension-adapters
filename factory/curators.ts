import { CuratorConfig, getCuratorExport } from "../helpers/curators";
import { CHAIN } from "../helpers/chains";
import { createFactoryExports } from "./registry";

const zerolendMultisigs = [
  '0x54061E18cd88D2de9af3D3D7FDF05472253B29E0',
  '0x4E88E72bd81C7EA394cB410296d99987c3A242fE',
  '0x1f906603A027E686b43Fab7f395C11228EbE8ff4',
];

const configs: Record<string, CuratorConfig> = {
  "9summits": {
    vaults: {
      ethereum: {
        morphoVaultOwners: ['0x23E6aecB76675462Ad8f2B31eC7C492060c2fAEF'],
        morpho: ['0xb5e4576C2FAA16b0cC59D1A2f3366164844Ef9E0', '0x1E2aAaDcF528b9cC08F43d4fd7db488cE89F5741', '0x0bB2751a90fFF62e844b1521637DeD28F3f5046A'],
      },
      base: {
        morphoVaultOwners: ['0x23E6aecB76675462Ad8f2B31eC7C492060c2fAEF'],
      },
    },
  },
  "alpha-growth": {
    vaults: {
      [CHAIN.UNICHAIN]: {
        eulerVaultOwners: ['0x8d9fF30f8ecBA197fE9492A0fD92310D75d352B9'],
      },
    },
  },
  "alphaping": {
    vaults: {
      ethereum: {
        morphoVaultOwners: ['0xEB4Af6fA3AFA08B10d593EC8fF87efB03BC04645'],
      },
    },
  },
  "alterscope": {
    vaults: {
      ethereum: {
        eulerVaultOwners: ['0x0d8249DD621fB1c386A7A7A949504035Dd3436A3'],
      },
    },
  },
  "apostro": {
    vaults: {
      ethereum: {
        morphoVaultOwners: ['0x3B8DfE237895f737271371F339eEcbd66Face43e', '0xf726311F85D45a7fECfFbC94bD8508a0A39958c6'],
        eulerVaultOwners: ['0x3B8DfE237895f737271371F339eEcbd66Face43e', '0xf726311F85D45a7fECfFbC94bD8508a0A39958c6'],
      },
      base: {
        morphoVaultOwners: ['0x3B8DfE237895f737271371F339eEcbd66Face43e', '0xf726311F85D45a7fECfFbC94bD8508a0A39958c6'],
        eulerVaultOwners: ['0x3B8DfE237895f737271371F339eEcbd66Face43e', '0xf726311F85D45a7fECfFbC94bD8508a0A39958c6'],
      },
      bsc: {
        eulerVaultOwners: ['0x3B8DfE237895f737271371F339eEcbd66Face43e', '0xf726311F85D45a7fECfFbC94bD8508a0A39958c6'],
      },
    },
  },
  "avantgarde": {
    vaults: {
      [CHAIN.ETHEREUM]: {
        morphoVaultOwners: ['0xb263237E30fe9be53d6F401FCC50dF125D60F01a'],
      },
    },
  },
  "b-protocol": {
    vaults: {
      ethereum: {
        morphoVaultOwners: ['0xf7D44D5a28d5AF27a7F9c8fc6eFe0129e554d7c4', '0x2566f66f68ed438726AD904524FB306A03FdB80B', '0x17e7bB9fe7983947FdCf02c1E3d8e6C92C21da54'],
      },
      base: {
        morphoVaultOwners: ['0x17e7bB9fe7983947FdCf02c1E3d8e6C92C21da54'],
      },
    },
  },
  "block-analitica": {
    vaults: {
      ethereum: {
        morpho: ['0x38989BBA00BDF8181F4082995b3DEAe96163aC5D', '0x2C25f6C25770fFEC5959D34B94Bf898865e5D6b1', '0x186514400e52270cef3D80e1c6F8d10A75d47344'],
      },
      base: {
        morpho: ['0xa0E430870c4604CcfC7B38Ca7845B1FF653D0ff1', '0xc1256Ae5FF1cf2719D4937adb3bbCCab2E00A2Ca', '0x543257eF2161176D7C8cD90BA65C2d4CaEF5a796', '0xf24608E0CCb972b0b0f4A6446a0BBf58c701a026'],
      },
    },
  },
  "clearstar": {
    vaults: {
      [CHAIN.BASE]: { morphoVaultOwners: ['0x30988479C2E6a03E7fB65138b94762D41a733458'] },
      [CHAIN.ETHEREUM]: { morphoVaultOwners: ['0x30988479C2E6a03E7fB65138b94762D41a733458'] },
      [CHAIN.POLYGON]: { morphoVaultOwners: ['0x30988479C2E6a03E7fB65138b94762D41a733458'] },
      [CHAIN.UNICHAIN]: { morphoVaultOwners: ['0x30988479C2E6a03E7fB65138b94762D41a733458'], start: '2025-10-01' },
      [CHAIN.ARBITRUM]: { morphoVaultOwners: ['0x30988479C2E6a03E7fB65138b94762D41a733458'] },
      [CHAIN.HEMI]: { morphoVaultOwners: ['0x30988479C2E6a03E7fB65138b94762D41a733458'], start: '2025-10-01' },
    },
  },
  "edge-capital": {
    vaults: {
      tac: {
        eulerVaultOwners: ['0x28D55817f358F7BE7505C918DaeCaA86366403f5', '0xb47a3b5ae494a20c69ff0486573ced665750dbc1', '0xB2b9a27a6160Bf9ffbD1a8d245f5de75541b1DDD'],
      },
    },
  },
  "euler-dao": {
    vaults: {
      [CHAIN.ETHEREUM]: { eulerVaultOwners: ['0xEe009FAF00CF54C1B4387829aF7A8Dc5f0c8C8C5', '0x95058F3d4C69F14f6125ad4602E925845BD5d6A4'], start: '2024-09-23' },
      [CHAIN.BASE]: { eulerVaultOwners: ['0x8359062798F09E277ABc6EB7D51652289176D2e9', '0x95058F3d4C69F14f6125ad4602E925845BD5d6A4'], start: '2024-09-23' },
      [CHAIN.UNICHAIN]: { eulerVaultOwners: ['0x3566a8b300606516De2E4576eC4132a0E13f9f66'], start: '2025-05-14' },
      [CHAIN.SWELLCHAIN]: { eulerVaultOwners: ['0xC798cA555e4C7e6Fa04A23e1a727c12884F40B69'], start: '2025-01-01' },
      [CHAIN.LINEA]: { eulerVaultOwners: ['0x624DC899774EEf1cD9c17ED10d19c9483Fa9eb0A'], start: '2025-10-01' },
      [CHAIN.ARBITRUM]: { eulerVaultOwners: ['0xAeE4e2E8024C1B58f4686d1CB1646a6d5755F05C'], start: '2025-10-01' },
      [CHAIN.MONAD]: { eulerVaultOwners: ['0x5D42F8aCd567810D57D60f90bB9C6d194207a6e1'], start: '2025-11-28' },
    },
  },
  "feather": {
    vaults: {
      [CHAIN.SEI]: {
        morpho: ['0x948FcC6b7f68f4830Cd69dB1481a9e1A142A4923', '0x015F10a56e97e02437D294815D8e079e1903E41C'],
        start: '2025-10-02',
      },
    },
  },
  "felix-vaults": {
    vaults: {
      hyperliquid: {
        morpho: ['0x835febf893c6dddee5cf762b0f8e31c5b06938ab', '0xfc5126377f0efc0041c0969ef9ba903ce67d151e', '0x9c59a9389d8f72de2cdaf1126f36ea4790e2275e', '0x2900ABd73631b2f60747e687095537B673c06A76', '0x9896a8605763106e57A51aa0a97Fe8099E806bb3', '0x66c71204B70aE27BE6dC3eb41F9aF5868E68fDb6', '0x8A862fD6c12f9ad34C9c2ff45AB2b6712e8CEa27', '0x207ccaE51Ad2E1C240C4Ab4c94b670D438d2201C'],
      },
    },
  },
  "fence": {
    vaults: {
      ethereum: {
        morphoVaultOwners: ['0xF92971B4D9e6257CF562400ed81d2986F28a8c26'],
      },
    },
  },
  "hakutora": {
    vaults: {
      ethereum: {
        morphoVaultOwners: ['0x76c303fA012109eCBb34E4bAf1789c3e9FbEb3A4'],
      },
    },
  },
  "hyperithm": {
    vaults: {
      [CHAIN.ETHEREUM]: {
        morphoVaultOwners: ['0x16fa314141C76D4a0675f5e8e3CCBE4E0fA22C7c'],
        morphoVaultV2Owners: ['0xC56EA16EA06B0a6A7b3B03B2f48751e549bE40fD'],
      },
    },
  },
  "k3": {
    vaults: {
      [CHAIN.BSC]: { eulerVaultOwners: ['0x5Bb012482Fa43c44a29168C6393657130FDF0506', '0x2E28c94eE56Ac6d82600070300d86b3a14D5d71A'], start: '2023-10-02' },
      [CHAIN.AVAX]: { eulerVaultOwners: ['0xa4dC6C20475fDD05b248fbE51F572bD3154dd03B', '0xdD84A24eeddE63F10Ec3e928f1c8302A47538b6B'], start: '2023-10-02' },
      [CHAIN.BOB]: { eulerVaultOwners: ['0xDb81B93068B886172988A1A4Dd5A1523958a23f0'], start: '2024-08-29' },
      [CHAIN.PLASMA]: { eulerVaultOwners: ['0x060DB084bF41872861f175d83f3cb1B5566dfEA3'], start: '2025-10-03' },
      [CHAIN.ARBITRUM]: { eulerVaultOwners: ['0xAeE4e2E8024C1B58f4686d1CB1646a6d5755F05C'], start: '2025-07-01' },
      [CHAIN.UNICHAIN]: { eulerVaultOwners: ['0xAeE4e2E8024C1B58f4686d1CB1646a6d5755F05C'], start: '2025-10-01' },
      [CHAIN.ETHEREUM]: { morphoVaultOwners: ['0xdD84A24eeddE63F10Ec3e928f1c8302A47538b6B'], eulerVaultOwners: ['0xdD84A24eeddE63F10Ec3e928f1c8302A47538b6B'], start: '2025-07-01' },
    },
  },
  "keyring": {
    vaults: {
      [CHAIN.AVAX]: {
        eulerVaultOwners: ['0x0B50beaE6aac0425e31d5a29080F2A7Dec22754a'],
      },
    },
  },
  "llamarisk": {
    vaults: {
      ethereum: {
        morphoVaultOwners: ['0x0FB44352bcfe4c5A53a64Dd0faD9a41184A1D609'],
      },
    },
  },
  "m11c": {
    vaults: {
      ethereum: {
        morphoVaultOwners: ['0x71807287926c5195D92D2872e73FC212C150C112'],
      },
    },
  },
  "mev-capital": {
    vaults: {
      ethereum: {
        morphoVaultOwners: ['0x06590Fef209Ebc1f8eEF83dA05984cD4eFf0d0E3', '0x650741eB4f6AB0776B9bF98A3280E3Cd6A2F1BF1', '0x6fA5d361Ab8165347F636217001E22a7cEF09B48'],
        eulerVaultOwners: ['0xF1B4Ad34B4DbBAab120e4A04Eb3D3707Ea41b6eb', '0x6293e97900aA987Cf3Cbd419e0D5Ba43ebfA91c1'],
      },
      sonic: {
        eulerVaultOwners: ['0xb1a084b03a75f4bBb895b91BF1f5E9615A28F17D', '0xB672Ea44A1EC692A9Baf851dC90a1Ee3DB25F1C4', '0x6293e97900aA987Cf3Cbd419e0D5Ba43ebfA91c1', '0x3fEcc0d59BF024De157996914e548047ec0ccCE5'],
      },
      berachain: {
        eulerVaultOwners: ['0xd93A628567a93031A8aC63fd426Ae9fb80Ce7bb2', '0xb1a084b03a75f4bBb895b91BF1f5E9615A28F17D', '0x18d23B961b11079EcD499c0EAD8E4F347e4d3A66'],
      },
      avax: {
        eulerVaultOwners: ['0xa16a6eCE1F7DdE85026bf66DdE03a2746E9EA3BE'],
      },
      bob: {
        eulerVaultOwners: ['0xc1452E2C136B9e6b307862428c84AeB8829adf29'],
      },
      bsc: {
        eulerVaultOwners: ['0xC6ac2365C94f007fB3f682F48c7Db9c36d4FA6df'],
      },
    },
  },
  "moonwell-vaults": {
    vaults: {
      optimism: {
        morphoVaultOwners: ['0x17e7bB9fe7983947FdCf02c1E3d8e6C92C21da54'],
        start: '2025-02-01',
      },
    },
  },
  "muscadine": {
    vaults: {
      base: {
        morpho: ['0xf7e26Fa48A568b8b0038e104DfD8ABdf0f99074F', '0xAeCc8113a7bD0CFAF7000EA7A31afFD4691ff3E9', '0x21e0d366272798da3A977FEBA699FCB91959d120', '0x89712980cb434ef5ae4ab29349419eb976b0b496', '0xd6dcad2f7da91fbb27bda471540d9770c97a5a43', '0x99dcd0d75822ba398f13b2a8852b07c7e137ec70'],
      },
    },
  },
  "mystic-finance": {
    vaults: {
      [CHAIN.PLUME]: {
        morpho: ['0xc0Df5784f28046D11813356919B869dDA5815B16', '0x0b14D0bdAf647c541d3887c5b1A4bd64068fCDA7', '0xBB748a1346820560875CB7a9cD6B46c203230E07'],
        start: '2025-05-14',
      },
    },
  },
  "ouroboros": {
    vaults: {
      ethereum: {
        morphoVaultOwners: ['0x517aBc7f49DFF75b57A88b9970eF35D6e4C3BD49'],
        eulerVaultOwners: ['0x517aBc7f49DFF75b57A88b9970eF35D6e4C3BD49'],
      },
    },
  },
  "re7": {
    vaults: {
      [CHAIN.ETHEREUM]: {
        morphoVaultOwners: ['0x46BA7bCD764a692208781B0Fdc642E272ee597bC', '0xE86399fE6d7007FdEcb08A2ee1434Ee677a04433'],
        eulerVaultOwners: ['0xa563FEEA4028FADa193f1c1F454d446eEaa6cfD7', '0x46BA7bCD764a692208781B0Fdc642E272ee597bC'],
      },
      [CHAIN.BASE]: {
        morphoVaultOwners: ['0xD8B0F4e54a8dac04E0A57392f5A630cEdb99C940'],
        morphoVaultV2Owners: ['0xE5EAE3770750dC9E9eA5FB1B1d81A0f9C6c3369c'],
      },
      [CHAIN.SONIC]: {
        eulerVaultOwners: ['0xF602d3816bC63fC5f5Dc87bB56c537D0d0078532', '0x46BA7bCD764a692208781B0Fdc642E272ee597bC'],
      },
      [CHAIN.BOB]: {
        eulerVaultOwners: ['0x46BA7bCD764a692208781B0Fdc642E272ee597bC'],
      },
      [CHAIN.BERACHAIN]: {
        eulerVaultOwners: ['0x46BA7bCD764a692208781B0Fdc642E272ee597bC'],
      },
      [CHAIN.AVAX]: {
        eulerVaultOwners: ['0x7B41b9891887820A75A51a1025dB1A54f4798521', '0x3BA1566ED39F865bAf4c1Eb9acE53F3D2062bE65'],
      },
      [CHAIN.BSC]: {
        eulerVaultOwners: ['0x187620a61f4f00Cb629b38e1b38BEe8Ea60d2B8D'],
      },
      [CHAIN.WC]: {
        morphoVaultOwners: ['0x46BA7bCD764a692208781B0Fdc642E272ee597bC', '0x598A41fA4826e673829D4c5AfD982C0a43977ca6'],
      },
      [CHAIN.POLYGON]: {
        morphoVaultOwners: ['0x7B41b9891887820A75A51a1025dB1A54f4798521'],
      },
      [CHAIN.TAC]: {
        eulerVaultOwners: ['0xE5EAE3770750dC9E9eA5FB1B1d81A0f9C6c3369c'],
      },
      [CHAIN.LINEA]: {
        eulerVaultOwners: ['0xE5EAE3770750dC9E9eA5FB1B1d81A0f9C6c3369c'],
      },
    },
  },
  "relend": {
    vaults: {
      ethereum: {
        morpho: ['0x0F359FD18BDa75e9c49bC027E7da59a4b01BF32a', '0xB9C9158aB81f90996cAD891fFbAdfBaad733c8C6'],
      },
      base: {
        morpho: ['0x70F796946eD919E4Bc6cD506F8dACC45E4539771'],
      },
      swellchain: {
        euler: ['0xc5976e0356f0A3Ce8307fF08C88bB05933F88761'],
        start: '2025-04-28',
      },
    },
  },
  "seamless-vaults": {
    vaults: {
      [CHAIN.BASE]: {
        morpho: ['0x616a4E1db48e22028f6bbf20444Cd3b8e3273738', '0x27D8c7273fd3fcC6956a0B370cE5Fd4A7fc65c18', '0x5a47C803488FE2BB0A0EAaf346b420e4dF22F3C7'],
        start: '2025-01-21',
      },
    },
  },
  "sentora": {
    vaults: {
      [CHAIN.ETHEREUM]: {
        eulerVaultOwners: ['0x5aB5FE7d04CFDeFb9daf61f6f569a58A53D05eE1'],
        morphoVaultV2Owners: ['0x13DE0cEE0B83562CBfD46682e10FfA4E3c5090e1'],
      },
    },
  },
  "singularv": {
    vaults: {
      [CHAIN.ETHEREUM]: {
        morphoVaultOwners: ['0x46057881E0B9d190920FB823F840B837f65745d5'],
      },
    },
  },
  "solera": {
    vaults: {
      [CHAIN.HEMI]: {
        morphoVaultOwners: ['0x05c2e246156d37b39a825a25dd08D5589e3fd883', '0xA7dB73F80a173c31A1241Bf97F4452A07e443c6c', '0x7e8195b96bbcFAd0e20243Dcc686D188a827F256'],
        start: '2025-09-13',
      },
    },
  },
  "steakhouse": {
    vaults: {
      [CHAIN.ETHEREUM]: {
        morphoVaultOwners: ['0x0000aeB716a0DF7A9A1AAd119b772644Bc089dA8', '0x255c7705e8BB334DfCae438197f7C4297988085a', '0x0A0e559bc3b0950a7e448F0d4894db195b9cf8DD', '0xc01Ba42d4Bd241892B813FA8bD4589EAa4C60672'],
        morphoVaultV2Owners: ['0xec0Caa2CbAe100CEAaC91A665157377603a6B766'],
      },
      [CHAIN.BASE]: {
        morphoVaultOwners: ['0x0A0e559bc3b0950a7e448F0d4894db195b9cf8DD', '0x0000aeB716a0DF7A9A1AAd119b772644Bc089dA8'],
        morphoVaultV2Owners: ['0x351D76EC45f0aD6Deb498806F1320F75F861a114'],
      },
      [CHAIN.CORN]: {
        morphoVaultOwners: ['0x84ae7f8eb667b391a5ae2f69bd5a0e4b5b77c999'],
        start: '2025-04-30',
      },
      [CHAIN.MONAD]: {
        morphoVaultOwners: ['0x0000aeB716a0DF7A9A1AAd119b772644Bc089dA8'],
        morphoVaultV2Owners: ['0xD546Dc0dB55c28860176147b2D0FEFcc533eCf08'],
        start: '2025-12-15',
      },
    },
  },
  "telosc": {
    vaults: {
      [CHAIN.ETHEREUM]: {
        eulerVaultOwners: ['0x7054b25D47b9342dA3517AD41A4BD083De8D3f70', '0x7d07BFdd01422D7b655B333157eB551B9712dCd8'],
        start: '2025-10-04',
      },
      [CHAIN.PLASMA]: {
        eulerVaultOwners: ['0x7054b25D47b9342dA3517AD41A4BD083De8D3f70', '0x7d07BFdd01422D7b655B333157eB551B9712dCd8'],
        start: '2025-09-27',
      },
    },
  },
  "tulip-capital": {
    vaults: {
      ethereum: {
        morphoVaultOwners: ['0x59e608E4842162480591032f3c8b0aE55C98d104'],
        eulerVaultOwners: ['0x7c615e12D1163fc0DdDAA01B51922587034F5C93'],
      },
      berachain: {
        eulerVaultOwners: ['0x18d23B961b11079EcD499c0EAD8E4F347e4d3A66'],
      },
      bob: {
        eulerVaultOwners: ['0x7c615e12D1163fc0DdDAA01B51922587034F5C93'],
      },
      bsc: {
        eulerVaultOwners: ['0x7c615e12D1163fc0DdDAA01B51922587034F5C93'],
      },
    },
  },
  "vault-bridge": {
    vaults: {
      [CHAIN.ETHEREUM]: {
        morpho: ['0xBEefb9f61CC44895d8AEc381373555a64191A9c4', '0xc54b4E08C1Dcc199fdd35c6b5Ab589ffD3428a8d', '0x31A5684983EeE865d943A696AAC155363bA024f9', '0x812B2C6Ab3f4471c0E43D4BB61098a9211017427'],
        start: '2025-05-19',
      },
    },
  },
  "vii-finance": {
    methodology: {
      Fees: "Fees paid from token swaps from assets deployed by Vii vaults.",
      SupplySideRevenue: "All fees and interest are distributed to LPs.",
    },
    vaults: {
      [CHAIN.UNICHAIN]: {
        start: '2025-09-01',
        eulerVaultOwners: ['0x12e74f3C61F6b4d17a9c3Fdb3F42e8f18a8bB394'],
      },
    },
  },
  "yearn-curating": {
    vaults: {
      [CHAIN.ETHEREUM]: {
        morphoVaultOwners: ['0xFc5F89d29CCaa86e5410a7ad9D9d280d4455C12B'],
      },
      [CHAIN.BASE]: {
        morphoVaultOwners: ['0xFc5F89d29CCaa86e5410a7ad9D9d280d4455C12B', '0x50b75d586929ab2f75dc15f07e1b921b7c4ba8fa'],
      },
    },
  },
  "zerolend-vaults": {
    vaults: {
      [CHAIN.ETHEREUM]: {
        eulerVaultOwners: zerolendMultisigs,
        euler: ['0xc42d337861878baa4dc820d9e6b6c667c2b57e8a', '0x1ab9e92cfde84f38868753d30ffc43f812b803c5', '0xc364fd9637fe562a2d5a1cbc7d1ab7f32be900ef'],
        start: '2025-08-21',
      },
      [CHAIN.LINEA]: {
        eulerVaultOwners: zerolendMultisigs,
        euler: ['0x14efcc1ae56e2ff75204ef2fb0de43378d0beada', '0x085f80df643307e04f23281f6fdbfaa13865e852', '0x9ac2f0a564b7396a8692e1558d23a12d5a2abb1f'],
        start: '2025-08-21',
      },
      [CHAIN.BERACHAIN]: {
        eulerVaultOwners: zerolendMultisigs,
        euler: ['0x28C96C7028451454729750171BD3Bb95D7261B5a', '0x112B77A77753b092306b1c04Bd70215FeD4e00a1', '0x1B33D24C4C78a61DA80Cfa2d0dB72ca0851d5fb1', '0x2247B618251b8d913F3fD10B749e7bfa3E3a28db', '0x401c4633dCa173bf75ac85F2D270d98c063F54CF', '0x2Bf927248f86Bd78ce300d00C7c8A175e3e0B38a'],
        start: '2025-08-21',
      },
      [CHAIN.SONIC]: {
        eulerVaultOwners: zerolendMultisigs,
        euler: ['0x8c7a2c0729afb927da27d4c9aa172bc5a5fb12bb', '0x9ccf74e64922d8a48b87aa4200b7c27b2b1d860a'],
      },
    },
  },
};

const protocols: Record<string, any> = {};
for (const [name, config] of Object.entries(configs)) {
  protocols[name] = getCuratorExport(config);
}

export const { protocolList, getAdapter } = createFactoryExports(protocols);
