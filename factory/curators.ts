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
      [CHAIN.ETHEREUM]: {
        morphoVaultOwners: ['0x23E6aecB76675462Ad8f2B31eC7C492060c2fAEF'],
        morpho: ['0xb5e4576C2FAA16b0cC59D1A2f3366164844Ef9E0', '0x1E2aAaDcF528b9cC08F43d4fd7db488cE89F5741', '0x0bB2751a90fFF62e844b1521637DeD28F3f5046A'],
      },
      [CHAIN.BASE]: {
        morphoVaultOwners: ['0x23E6aecB76675462Ad8f2B31eC7C492060c2fAEF'],
      },
    },
  },
  "alphaping": {
    vaults: {
      [CHAIN.ETHEREUM]: {
        morphoVaultOwners: ['0xEB4Af6fA3AFA08B10d593EC8fF87efB03BC04645'],
      },
    },
  },
  "alterscope": {
    vaults: {
      [CHAIN.ETHEREUM]: {
        eulerVaultOwners: ['0x0d8249DD621fB1c386A7A7A949504035Dd3436A3'],
      },
    },
  },
  "api3": {
    vaults: {
      [CHAIN.ETHEREUM]: {
        morphoVaultOwners: ['0x9f0566F2E8Ff51901DD0C0E7aad937A94931f75C', '0x5a9AA3219dD1cBEF6A18Fd221464E071DF2677c2'],
        morphoVaultV2Owners: ['0x9f0566F2E8Ff51901DD0C0E7aad937A94931f75C', '0x5a9AA3219dD1cBEF6A18Fd221464E071DF2677c2'],
      },
    },
  },
  "apostro": {
    vaults: {
      [CHAIN.ETHEREUM]: {
        morphoVaultOwners: ['0x3B8DfE237895f737271371F339eEcbd66Face43e', '0xf726311F85D45a7fECfFbC94bD8508a0A39958c6'],
        eulerVaultOwners: ['0x3B8DfE237895f737271371F339eEcbd66Face43e', '0xf726311F85D45a7fECfFbC94bD8508a0A39958c6'],
      },
      [CHAIN.BASE]: {
        morphoVaultOwners: ['0x3B8DfE237895f737271371F339eEcbd66Face43e', '0xf726311F85D45a7fECfFbC94bD8508a0A39958c6'],
        eulerVaultOwners: ['0x3B8DfE237895f737271371F339eEcbd66Face43e', '0xf726311F85D45a7fECfFbC94bD8508a0A39958c6'],
      },
      [CHAIN.BSC]: {
        eulerVaultOwners: ['0x3B8DfE237895f737271371F339eEcbd66Face43e', '0xf726311F85D45a7fECfFbC94bD8508a0A39958c6'],
      },
    },
  },
  "armitage": {
    vaults: {
      [CHAIN.ETHEREUM]: {
        // Armitage by Wintermute, verified curator on api.morpho.org.
        // Morpho VaultV2s, so fee() reverts and performanceFee() is the fee source.
        morphoV2: [
          '0x5dc53a23AdC9f2Bed98de6F59F7F309a7c71FF2B', // Wintermute USDC Prime
          '0xA2EAaD0D586cF9FD73bb2c09cF6A7E3e187D68cd', // Wintermute USDC Select
          '0x55C1B6e461a6334B567bAF0FEb5D728715446f05', // Pendle Ecosystem USDC
        ],
      },
    },
  },
  "avantgarde": {
    vaults: {
      [CHAIN.ETHEREUM]: {
        morphoVaultOwners: ['0xb263237E30fe9be53d6F401FCC50dF125D60F01a', '0xc714F33c2527BF61749C06eA0389EC957D8153D4']
      },
      [CHAIN.BASE]: {
        morphoVaultOwners: ["0x80C6c6438a438Ad3B3736a02B47793D6f854f2bF"]
      },
    },
  },
  "b-protocol": {
    vaults: {
      [CHAIN.ETHEREUM]: {
        morphoVaultOwners: ['0xf7D44D5a28d5AF27a7F9c8fc6eFe0129e554d7c4', '0x2566f66f68ed438726AD904524FB306A03FdB80B', '0x17e7bB9fe7983947FdCf02c1E3d8e6C92C21da54'],
      },
      [CHAIN.BASE]: {
        morphoVaultOwners: ['0x17e7bB9fe7983947FdCf02c1E3d8e6C92C21da54'],
      },
    },
  },
  "block-analitica": {
    vaults: {
      [CHAIN.ETHEREUM]: {
        morpho: ['0x38989BBA00BDF8181F4082995b3DEAe96163aC5D', '0x2C25f6C25770fFEC5959D34B94Bf898865e5D6b1', '0x186514400e52270cef3D80e1c6F8d10A75d47344'],
      },
      // The four Base Moonwell vaults that used to be listed here are already
      // resolved by the moonwell-vaults owner below, so both entries booked the
      // same fees. Morpho's API also reports their curator as Anthias Labs, not
      // Block Analitica.
    },
  },
  "clearstar": {
    vaults: {
      // The V2 owner lists below are the indexed `owner` of CreateVaultV2, taken from each vault's
      // creation receipt, not the current owner() (every one of these vaults is owned today by
      // 0xb3CF59A5, a Clearstar address in Morpho's curators registry on chains 1, 143 and 8453).
      // 0x829A1385 is already registered as a Clearstar V2 owner on katana below.
      [CHAIN.BASE]: {
        morphoVaultOwners: ['0x30988479C2E6a03E7fB65138b94762D41a733458'],
        // 0x829A1385 created "Clearstar cbAssets Vault" (0x91C0...3a3c), "Clearstar Core ETH"
        // (0xBCA4...71da) and "Clearstar CoreUSDC" (0x116e...0E46); 0x3098...3458 created
        // "Clearstar Reactor EURC" (0x4C7b...C55C) and "Clearstar Boring USDC" (0x0282...0681).
        // https://base.blockscout.com/tx/0xebe8310f28cb502a87403f501db7fce667c7fafd95d65c56d5e913bd7139e6f2
        morphoVaultV2Owners: ['0x829A13850b684A575C0580a83322890e19c5eFaa', '0x30988479C2E6a03E7fB65138b94762D41a733458'],
      },
      [CHAIN.ETHEREUM]: {
        morphoVaultOwners: ['0x30988479C2E6a03E7fB65138b94762D41a733458'],
        // 0x3098...3458 created "3Jane Ecosystem Vault" (0xe05f...9826), "Re Ecosystem Vault"
        // (0xD1E9...4A7e) and "Clearstar USDC Core" (0x69A2...c284); 0x829A1385 created
        // "Clearstar Boring USDC" (0xF3Cc...Db49).
        // https://etherscan.io/tx/0x54939debbe1cf29d026262333b63b209613f4a84ef32739d07658d47a9287335
        morphoVaultV2Owners: ['0x30988479C2E6a03E7fB65138b94762D41a733458', '0x829A13850b684A575C0580a83322890e19c5eFaa'],
      },
      [CHAIN.MONAD]: {
        // 0x829A1385 created "Clearstar Accountable AUSD" (0xbe3E...E9a1, the start date below is
        // its creation) and "Clearstar Yield AUSD" (0x8192...ad06).
        morphoVaultV2Owners: ['0x829A13850b684A575C0580a83322890e19c5eFaa'],
        start: '2026-05-28',
      },
      [CHAIN.POLYGON]: { morphoVaultOwners: ['0x30988479C2E6a03E7fB65138b94762D41a733458'] },
      [CHAIN.UNICHAIN]: { morphoVaultOwners: ['0x30988479C2E6a03E7fB65138b94762D41a733458'], start: '2025-10-01' },
      [CHAIN.ARBITRUM]: { morphoVaultOwners: ['0x30988479C2E6a03E7fB65138b94762D41a733458'] },
      [CHAIN.HEMI]: { morphoVaultOwners: ['0x30988479C2E6a03E7fB65138b94762D41a733458'], start: '2025-10-01' },
      [CHAIN.KATANA]: {
        morphoVaultOwners: ['0x30988479C2E6a03E7fB65138b94762D41a733458'],
        morphoVaultV2Owners: ['0x30988479C2E6a03E7fB65138b94762D41a733458', '0x829A13850b684A575C0580a83322890e19c5eFaa'],
        start: '2025-08-11'
      },
      // Mystic is a Morpho fork, so its vaults are not reachable through the
      // Morpho V2 factory lookup - listed by address instead.
      [CHAIN.FLARE]: {
        morphoV2: [
          '0xE8dd6A1e13244A27bDaa19CcBf33013647C675d1', // Core USDT0 on Mystic
          '0x1aEadA3C251215f1294720B80FcB3D1D005F3585', // Core wFLR on Mystic
          '0x53184aDaBF312b490BF1EbcFdC896FEfF6019a14', // Core FXRP on Mystic
        ],
        start: '2026-02-02',
      },
    },
  },
  "edge-capital": {
    vaults: {
      [CHAIN.TAC]: {
        eulerVaultOwners: ['0x28D55817f358F7BE7505C918DaeCaA86366403f5', '0xb47a3b5ae494a20c69ff0486573ced665750dbc1', '0xB2b9a27a6160Bf9ffbD1a8d245f5de75541b1DDD'],
      },
    },
  },
  "feather": {
    vaults: {
      [CHAIN.SEI]: {
        morpho: ['0x948FcC6b7f68f4830Cd69dB1481a9e1A142A4923', '0x015F10a56e97e02437D294815D8e079e1903E41C', '0x50715ae180ff0ea799dc8ab635c2d876e528bfe8'],
        start: '2025-10-02',
      },
    },
  },
  "felix-vaults": {
    vaults: {
      [CHAIN.HYPERLIQUID]: {
        morpho: ['0x835febf893c6dddee5cf762b0f8e31c5b06938ab', '0xfc5126377f0efc0041c0969ef9ba903ce67d151e', '0x9c59a9389d8f72de2cdaf1126f36ea4790e2275e', '0x2900ABd73631b2f60747e687095537B673c06A76', '0x9896a8605763106e57A51aa0a97Fe8099E806bb3', '0x66c71204B70aE27BE6dC3eb41F9aF5868E68fDb6', '0x8A862fD6c12f9ad34C9c2ff45AB2b6712e8CEa27', '0x207ccaE51Ad2E1C240C4Ab4c94b670D438d2201C', '0x808F72b6Ff632fba005C88b49C2a76AB01CAB545', '0x274f854b2042DB1aA4d6C6E45af73588BEd4Fc9D'],
      },
    },
  },
  "fence": {
    vaults: {
      [CHAIN.ETHEREUM]: {
        morphoVaultOwners: ['0xF92971B4D9e6257CF562400ed81d2986F28a8c26'],
      },
    },
  },
  "galaxy": {
    vaults: {
      [CHAIN.ETHEREUM]: {
        // Galaxy Curation, verified curator on api.morpho.org, which lists this
        // address on both chain 1 and chain 8453.
        morphoVaultOwners: ['0x42D510eDeb9257f8D920d5B9f5109D95cB22419d'],
        morphoVaultV2Owners: ['0x42D510eDeb9257f8D920d5B9f5109D95cB22419d'],
      },
      [CHAIN.BASE]: {
        morphoVaultOwners: ['0x42D510eDeb9257f8D920d5B9f5109D95cB22419d'],
        morphoVaultV2Owners: ['0x42D510eDeb9257f8D920d5B9f5109D95cB22419d'],
      },
    },
  },
  "hakutora": {
    vaults: {
      [CHAIN.ETHEREUM]: {
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
      [CHAIN.ARBITRUM]: {
        morphoVaultOwners: ['0xC56EA16EA06B0a6A7b3B03B2f48751e549bE40fD'],
        start: '2025-09-04',
      },
      [CHAIN.KATANA]: {
        morphoVaultV2Owners: ['0xC56EA16EA06B0a6A7b3B03B2f48751e549bE40fD'],
        start: '2025-12-22'
      },
      [CHAIN.MONAD]: {
        morphoVaultV2Owners: [
          '0xC56EA16EA06B0a6A7b3B03B2f48751e549bE40fD',
          '0x9B97783B747c51b39c3d320050dc9C512868dAa8',
        ],
        start: '2025-12-23', // hyperAUSDd creation, earliest of the four
      },
      [CHAIN.HYPERLIQUID]: {
        morphoVaultOwners: ['0x51afd54ff95c77A15E40E83DB020908f33557c97'],
        start: '2025-07-09', // hyperUSDT0, the earliest vault
      },
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
      [CHAIN.ETHEREUM]: {
        morphoVaultOwners: ['0x0FB44352bcfe4c5A53a64Dd0faD9a41184A1D609'],
      },
    },
  },
  "keyrock": {
    vaults: {
      [CHAIN.ETHEREUM]: {
        morphoVaultOwners: [
          '0xbA75546ACD56b3a9142f94F179b03970eE4283Fd', // initial owner — Keyrock V1/V2 vaults
        ],
      },
    },
  },
  "m11c": {
    vaults: {
      [CHAIN.ETHEREUM]: {
        morphoVaultOwners: ['0x71807287926c5195D92D2872e73FC212C150C112'],
      },
    },
  },
  "mev-capital": {
    vaults: {
      [CHAIN.ETHEREUM]: {
        morphoVaultOwners: ['0x06590Fef209Ebc1f8eEF83dA05984cD4eFf0d0E3', '0x650741eB4f6AB0776B9bF98A3280E3Cd6A2F1BF1', '0x6fA5d361Ab8165347F636217001E22a7cEF09B48', '0x0f2dc4f7d060e5cee687b3acabd85d5c94efb756'],
        eulerVaultOwners: ['0xF1B4Ad34B4DbBAab120e4A04Eb3D3707Ea41b6eb', '0x6293e97900aA987Cf3Cbd419e0D5Ba43ebfA91c1'],
      },
      [CHAIN.HYPERLIQUID]: {
        morphoVaultOwners: [
          '0x444543b439b1169cefc50be42caa628b0ea35d85',
          '0x6293e97900aA987Cf3Cbd419e0D5Ba43ebfA91c1',
          '0x6fA5d361Ab8165347F636217001E22a7cEF09B48',
          '0x0f2dc4f7d060e5cee687b3acabd85d5c94efb756',
        ],
        start: '2025-04-24',
      },
      [CHAIN.SONIC]: {
        eulerVaultOwners: ['0xb1a084b03a75f4bBb895b91BF1f5E9615A28F17D', '0xB672Ea44A1EC692A9Baf851dC90a1Ee3DB25F1C4', '0x6293e97900aA987Cf3Cbd419e0D5Ba43ebfA91c1', '0x3fEcc0d59BF024De157996914e548047ec0ccCE5'],
      },
      [CHAIN.BERACHAIN]: {
        eulerVaultOwners: ['0xd93A628567a93031A8aC63fd426Ae9fb80Ce7bb2', '0xb1a084b03a75f4bBb895b91BF1f5E9615A28F17D', '0x18d23B961b11079EcD499c0EAD8E4F347e4d3A66'],
      },
      [CHAIN.AVAX]: {
        eulerVaultOwners: ['0xa16a6eCE1F7DdE85026bf66DdE03a2746E9EA3BE'],
      },
      [CHAIN.BOB]: {
        eulerVaultOwners: ['0xc1452E2C136B9e6b307862428c84AeB8829adf29'],
      },
      [CHAIN.BSC]: {
        eulerVaultOwners: ['0xC6ac2365C94f007fB3f682F48c7Db9c36d4FA6df'],
      },
    },
  },
  "moonwell-vaults": {
    vaults: {
      [CHAIN.OPTIMISM]: {
        morphoVaultOwners: ['0x17e7bB9fe7983947FdCf02c1E3d8e6C92C21da54'],
        start: '2025-02-01',
      },
      [CHAIN.BASE]: {
        morphoVaultOwners: ['0x17e7bB9fe7983947FdCf02c1E3d8e6C92C21da54'],
        start: '2024-06-10',
      }
    },
  },
  "muscadine": {
    vaults: {
      [CHAIN.BASE]: {
        morphoVaultOwners: ['0xf35B121bA32cBeaA27716abEfFb6B65a55f9B333'],
        morphoVaultV2Owners: ['0xf35B121bA32cBeaA27716abEfFb6B65a55f9B333'],
        start: '2025-06-04',
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
      [CHAIN.ETHEREUM]: {
        morphoVaultOwners: ['0x517aBc7f49DFF75b57A88b9970eF35D6e4C3BD49'],
        eulerVaultOwners: ['0x517aBc7f49DFF75b57A88b9970eF35D6e4C3BD49'],
      },
    },
  },
  "re7": {
    breakdownFees: true,
    vaults: {
      [CHAIN.ETHEREUM]: {
        morphoVaultOwners: ['0x46BA7bCD764a692208781B0Fdc642E272ee597bC', '0xE86399fE6d7007FdEcb08A2ee1434Ee677a04433'],
        eulerVaultOwners: ['0xa563FEEA4028FADa193f1c1F454d446eEaa6cfD7', '0x46BA7bCD764a692208781B0Fdc642E272ee597bC'],
        start: '2024-09-25',
      },
      [CHAIN.BASE]: {
        morphoVaultOwners: ['0xD8B0F4e54a8dac04E0A57392f5A630cEdb99C940'],
        morphoVaultV2Owners: ['0xE5EAE3770750dC9E9eA5FB1B1d81A0f9C6c3369c'],
        start: '2024-09-25',
      },
      [CHAIN.SONIC]: {
        eulerVaultOwners: ['0xF602d3816bC63fC5f5Dc87bB56c537D0d0078532', '0x46BA7bCD764a692208781B0Fdc642E272ee597bC'],
        start: '2025-02-18',
      },
      [CHAIN.BOB]: {
        eulerVaultOwners: ['0x46BA7bCD764a692208781B0Fdc642E272ee597bC'],
        start: '2025-02-28',
      },
      [CHAIN.BERACHAIN]: {
        eulerVaultOwners: ['0x46BA7bCD764a692208781B0Fdc642E272ee597bC'],
        start: '2025-03-18',
      },
      [CHAIN.AVAX]: {
        eulerVaultOwners: ['0x7B41b9891887820A75A51a1025dB1A54f4798521', '0x3BA1566ED39F865bAf4c1Eb9acE53F3D2062bE65'],
        start: '2025-04-10',
      },
      [CHAIN.BSC]: {
        eulerVaultOwners: ['0x187620a61f4f00Cb629b38e1b38BEe8Ea60d2B8D'],
        start: '2025-04-17',
      },
      [CHAIN.WC]: {
        morphoVaultOwners: ['0x46BA7bCD764a692208781B0Fdc642E272ee597bC', '0x598A41fA4826e673829D4c5AfD982C0a43977ca6'],
        start: '2025-05-01',
      },
      [CHAIN.POLYGON]: {
        morphoVaultOwners: ['0x7B41b9891887820A75A51a1025dB1A54f4798521'],
        start: '2025-05-23',
      },
      [CHAIN.TAC]: {
        eulerVaultOwners: ['0xE5EAE3770750dC9E9eA5FB1B1d81A0f9C6c3369c'],
        start: '2025-07-20',
      },
      [CHAIN.LINEA]: {
        eulerVaultOwners: ['0xE5EAE3770750dC9E9eA5FB1B1d81A0f9C6c3369c'],
        start: '2025-08-20',
      },
    },
  },
  "relend": {
    vaults: {
      [CHAIN.ETHEREUM]: {
        morpho: ['0x0F359FD18BDa75e9c49bC027E7da59a4b01BF32a', '0xB9C9158aB81f90996cAD891fFbAdfBaad733c8C6'],
      },
      [CHAIN.BASE]: {
        morpho: ['0x70F796946eD919E4Bc6cD506F8dACC45E4539771'],
      },
      [CHAIN.SWELLCHAIN]: {
        euler: ['0xc5976e0356f0A3Ce8307fF08C88bB05933F88761'],
        start: '2025-04-28',
      },
    },
  },
  "rockawayx": {
    breakdownFees: true,
    vaults: {
      [CHAIN.ETHEREUM]: {
        // Morpho V2 vaults. 0x9ECB...8bf3 created "RockawayX USDC Yield" (0xE018...1965),
        // "RockawayX wETH" (0x64C1...9cB9) and "roxpUSDC" (0x5f82...8e21). RockawayX moved to a
        // second deployer safe, 0x22d4...676a, for "roxTORI" (0x3BD9...9478), "humaUSDC"
        // (0x8aC9...475c) and "mpUSDC" (0xe99A...0b3b) — every one of them is owned today by the
        // same RockawayX safe 0xbBacDCFB9691DFA1066aB29edfcc4A73f6DEf918 as the first three.
        morphoVaultV2Owners: [
          '0x9ECBf5aB609E33EC90D69888362639d652Eb8bf3',
          '0x22d4dbFFf37c7d7A0C7Afb9427A51de6F90a676a',
        ],
        // "figrUSDC" was created straight from a signer EOA of that safe rather than from either
        // deployer, so it is listed by address instead of widening the owner list to an individual.
        morphoV2: ['0xd65d6E8dbC3Cd3D12418199E6f4014dB3aaa0097'],
        start: '2026-03-06',
      },
      [CHAIN.BASE]: {
        // "RockawayX Midas USDC Prime" (0xAE41...9Edc), created by the same 0x22d4...676a safe.
        morphoVaultV2Owners: ['0x22d4dbFFf37c7d7A0C7Afb9427A51de6F90a676a'],
        start: '2026-06-01',
      },
      [CHAIN.BSC]: {
        // Lista/Moolah vault "RockawayX PT Yield" — fork MetaMorpho, fee() = 10%
        morpho: ['0xb5a30e1fa2cf3c8dea882124b3ab5a47a27c5dd2'],
        start: '2026-04-16',
      },
      [CHAIN.SEI]: {
        // Feather PYUSD0 — vault MetaMorpho v1 sur Sei, fee() = 15%
        morpho: ['0x6137dcfdd3c83fe2922b1cba4105d2e92b327a06'],
        start: '2026-03-22',
      },
      [CHAIN.SOLANA]: {
        // Kamino kvaults curated by RockawayX. Both share vaultAdminAuthority
        // 5WodE5oHa6Uy16zg4eTep9t6DqJKx7jFN6bomAm7bVQv, which owns exactly these
        // two: "RWA USDC" (DWSX...) and "RockawayX SOL" (Hoff...). The third vault
        // listed under RockawayX on the TVL side ("Marinade USD", 2TNC...) has a
        // different admin authority, so it is not attributed here.
        kaminoVaults: [
          'DWSXb18xZApz29vnQpgR2m6MynCT7PznaXt7Ut7M7KaP',
          'HoffqVZUNGGpEAhE42E1DqNYSwJjCkorfgiBN6NpT2or',
        ],
        start: '2026-01-13',
      },
    },
  },
  "seamless-vaults": {
    breakdownFees: true,
    vaults: {
      [CHAIN.BASE]: {
        morpho: ['0x616a4E1db48e22028f6bbf20444Cd3b8e3273738', '0x27D8c7273fd3fcC6956a0B370cE5Fd4A7fc65c18', '0x5a47C803488FE2BB0A0EAaf346b420e4dF22F3C7'],
        start: '2025-01-21',
      },
    },
  },
  "singularv": {
    breakdownFees: true,
    vaults: {
      [CHAIN.ETHEREUM]: {
        morphoVaultOwners: ['0x46057881E0B9d190920FB823F840B837f65745d5'],
      },
    },
  },
  "sky-money": {
    vaults: {
      [CHAIN.ETHEREUM]: {
        // Sky Money, verified curator on api.morpho.org.
        // Morpho VaultV2s, so fee() reverts and performanceFee() is the fee source.
        morphoV2: [
          '0x23f5E9c35820f4baB695Ac1F19c203cC3f8e1e11', // sky.money USDT Savings
          '0xE15fcC81118895b67b6647BBd393182dF44E11E0', // sky.money USDS Flagship
          '0x56bfa6f53669B836D1E0Dfa5e99706b12c373ecf', // sky.money USDC Risk Capital
          '0xf42bca228D9bd3e2F8EE65Fec3d21De1063882d4', // sky.money USDS Risk Capital
          '0x2bD3A43863c07B6A01581FADa0E1614ca5DF0E3d', // sky.money USDT Risk Capital
        ],
      },
    },
  },
  "solera": {
    breakdownFees: true,
    vaults: {
      [CHAIN.HEMI]: {
        morphoVaultOwners: ['0x05c2e246156d37b39a825a25dd08D5589e3fd883', '0xA7dB73F80a173c31A1241Bf97F4452A07e443c6c', '0x7e8195b96bbcFAd0e20243Dcc686D188a827F256'],
        start: '2025-09-13',
      },
    },
  },
  "steakhouse": {
    breakdownFees: true,
    vaults: {
      // Steakhouse deploys most V2 vaults from a per-vault deployer rather than one shared safe, so
      // the V2 owner lists below carry several addresses. Each is the indexed `owner` of that vault's
      // CreateVaultV2 event, taken from its creation receipt, not the current owner() (nearly all of
      // these vaults are owned today by 0x4D7bd498 on ethereum and 0x639bfA26 on base). Morpho's
      // curators API names the curator of every vault called out below "Steakhouse Financial".
      [CHAIN.ETHEREUM]: {
        morphoVaultOwners: ['0x0000aeB716a0DF7A9A1AAd119b772644Bc089dA8', '0x255c7705e8BB334DfCae438197f7C4297988085a', '0x0A0e559bc3b0950a7e448F0d4894db195b9cf8DD', '0xc01Ba42d4Bd241892B813FA8bD4589EAa4C60672'],
        morphoVaultV2Owners: [
          '0xec0Caa2CbAe100CEAaC91A665157377603a6B766', // Prime USDT, Prime ETH, High Yield Instant, Prime Instant
          '0x328dc4a2950b4A19fD440e9FfC6E9c3a496AFCFd', // Prime EURCV (0xbeef...DB2f), High Yield USDT, Safe x Steakhouse Prime Instant
          '0x7E17eC774bECD5f4f129fa5f150046dd0eCe5bB0', // Prime USDC (0xbeef...0f51), High Yield USDC. owner() is 0x0A0e559b, already a Steakhouse owner above
          '0x25FC16504b809FF3c730000544b8583011Ee7545', // Confidential Prime USDC (0xbEEF...542B)
          '0x966cdEEfFAa232e4137385731413E2be6FCBe0e7', // 3F x Steakhouse USDC (0xBEEf...183D), Prime EURC
          '0xcb0a0b2f84D0EaD648De7e10B85093b7F0FdA072', // tGBP (0xbeef...f04F)
          '0x274c71c8C071f2E29f0cC964767a7C8b31F5C544', // Grove x Steakhouse USDC (0xBeeF...4111)
        ],
        start: '2024-07-29',
      },
      [CHAIN.BASE]: {
        morphoVaultOwners: ['0x0A0e559bc3b0950a7e448F0d4894db195b9cf8DD', '0x0000aeB716a0DF7A9A1AAd119b772644Bc089dA8'],
        morphoVaultV2Owners: [
          '0x351D76EC45f0aD6Deb498806F1320F75F861a114', // High Yield USDC
          '0xC7cf133140A6AF6c2379BE2b353Ed5B66511FE04', // High Yield USDC Edition (0xbeef...8845)
          '0xF1F12e6a1b58fCce6D2Ed181CB55302c831Eb2Ac', // Ethena x Steakhouse USDC (0xBeEf...739e)
          '0x8A7CdA8322fB96D3457a5B32c8869A7B1a5B1Db7', // Prime EURC, Prime ETH
          '0x769699C75c4E17EbD5d678a9C58776179ddC254b', // Prime XSGD
          '0x8396d2B322f5f533531f960B042a15AAa2784529', // Farcaster x Steakhouse Prime
        ],
        start: '2024-07-29',
      },
      [CHAIN.CORN]: {
        morphoVaultOwners: ['0x84ae7f8eb667b391a5ae2f69bd5a0e4b5b77c999'],
        start: '2025-04-30',
      },
      [CHAIN.ARBITRUM]: {
        morphoVaultOwners: ['0x0000aeB716a0DF7A9A1AAd119b772644Bc089dA8'],
        morphoVaultV2Owners: ['0x0b1aA22117E38f260e0F3aB3b0F12a22c2691ffC'],
        start: '2025-07-17',
      },
      [CHAIN.KATANA]: {
        morphoVaultOwners: ['0xe6FC2a011153DD5a230725a9F0c89a9c81aB4887'],
        // High Yield USDC (0xbeef...b6c6) and Prime USDC (0xbeef...62D7), both created by this deployer
        morphoVaultV2Owners: ['0x627E54a84134FfB3c8Ee85a5A675cd50c2Db239b'],
        start: '2025-06-23',
      },
      [CHAIN.MONAD]: {
        morphoVaultOwners: ['0x0000aeB716a0DF7A9A1AAd119b772644Bc089dA8'],
        morphoVaultV2Owners: ['0xD546Dc0dB55c28860176147b2D0FEFcc533eCf08'],
        start: '2025-12-15',
      },
      [CHAIN.ROBINHOOD]: {
        morphoVaultV2Owners: ['0xfeed46c11F57B7126a773EeC6ae9cA7aE1C03C9a', '0xE9c34c8Fe2d8452807eA13148b3F52b91354eA04'],
        start: '2026-05-29',
      },
    },
  },
  "telosc": {
    breakdownFees: true,
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
    breakdownFees: true,
    vaults: {
      [CHAIN.ETHEREUM]: {
        morphoVaultOwners: ['0x59e608E4842162480591032f3c8b0aE55C98d104'],
        eulerVaultOwners: ['0x7c615e12D1163fc0DdDAA01B51922587034F5C93'],
        start: '2025-01-22',
      },
      [CHAIN.BERACHAIN]: {
        eulerVaultOwners: ['0x18d23B961b11079EcD499c0EAD8E4F347e4d3A66'],
        start: '2025-03-17',
      },
      [CHAIN.BOB]: {
        eulerVaultOwners: ['0x7c615e12D1163fc0DdDAA01B51922587034F5C93'],
        start: '2025-03-05',
      },
      [CHAIN.BSC]: {
        eulerVaultOwners: ['0x7c615e12D1163fc0DdDAA01B51922587034F5C93'],
        start: '2025-04-15',
      },
    },
  },
  "vault-bridge": {
    breakdownFees: true,
    vaults: {
      [CHAIN.ETHEREUM]: {
        morpho: ['0xBEefb9f61CC44895d8AEc381373555a64191A9c4', '0xc54b4E08C1Dcc199fdd35c6b5Ab589ffD3428a8d', '0x31A5684983EeE865d943A696AAC155363bA024f9', '0x812B2C6Ab3f4471c0E43D4BB61098a9211017427'],
        start: '2025-05-19',
      },
    },
  },
  "vii-finance": {
    breakdownFees: true,
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
    breakdownFees: true,
    vaults: {
      [CHAIN.ETHEREUM]: {
        morphoVaultOwners: ['0xFc5F89d29CCaa86e5410a7ad9D9d280d4455C12B', '0x75a1253432356f90611546a487b5350CEF08780D'],
      },
      [CHAIN.BASE]: {
        morphoVaultOwners: ['0xFc5F89d29CCaa86e5410a7ad9D9d280d4455C12B', '0x50b75d586929ab2f75dc15f07e1b921b7c4ba8fa'],
      },
      [CHAIN.ARBITRUM]: {
        morphoVaultOwners: ['0xFc5F89d29CCaa86e5410a7ad9D9d280d4455C12B'],
        start: '2025-07-22',
      },
      [CHAIN.KATANA]: {
        start: '2025-06-30',
        morphoVaultOwners: ['0xFc5F89d29CCaa86e5410a7ad9D9d280d4455C12B'],
        morphoVaultV2Owners: ['0x75a1253432356f90611546a487b5350CEF08780D'],
      },
    },
  },
  "zerolend-vaults": {
    breakdownFees: true,
    vaults: {
      [CHAIN.ETHEREUM]: {
        eulerVaultOwners: zerolendMultisigs,
        euler: ['0xc42d337861878baa4dc820d9e6b6c667c2b57e8a', '0x1ab9e92cfde84f38868753d30ffc43f812b803c5', '0xc364fd9637fe562a2d5a1cbc7d1ab7f32be900ef'],
        start: '2025-07-01',
      },
      [CHAIN.LINEA]: {
        eulerVaultOwners: zerolendMultisigs,
        euler: ['0x14efcc1ae56e2ff75204ef2fb0de43378d0beada', '0x085f80df643307e04f23281f6fdbfaa13865e852', '0x9ac2f0a564b7396a8692e1558d23a12d5a2abb1f'],
        start: '2025-07-01',
      },
      [CHAIN.BERACHAIN]: {
        eulerVaultOwners: zerolendMultisigs,
        euler: ['0x28C96C7028451454729750171BD3Bb95D7261B5a', '0x112B77A77753b092306b1c04Bd70215FeD4e00a1', '0x1B33D24C4C78a61DA80Cfa2d0dB72ca0851d5fb1', '0x2247B618251b8d913F3fD10B749e7bfa3E3a28db', '0x401c4633dCa173bf75ac85F2D270d98c063F54CF', '0x2Bf927248f86Bd78ce300d00C7c8A175e3e0B38a'],
        start: '2025-07-01',
      },
      // [CHAIN.SONIC]: {
      //   eulerVaultOwners: zerolendMultisigs,
      //   euler: ['0x8c7a2c0729afb927da27d4c9aa172bc5a5fb12bb', '0x9ccf74e64922d8a48b87aa4200b7c27b2b1d860a'],
      // },
    },
  },
};

const protocols: Record<string, any> = {};
for (const [name, config] of Object.entries(configs)) {
  protocols[name] = getCuratorExport(config);
}

export const { protocolList, getAdapter } = createFactoryExports(protocols);
