import { aaveLiquidationsExport } from "../helpers/aave/liquidations";
import { createFactoryExports } from "./registry";

type Config = Record<string, { pools: string[]; start: string }>;

const configs: Record<string, Config> = {
  "aave-v2": {
    ethereum: {
      pools: ['0x7d2768de32b0b80b7a3454c06bdac94a69ddc7a9'],
      start: '2020-12-01',
    },
    polygon: {
      pools: ['0x8dff5e27ea6b7ac08ebfdf9eb090f32ee9a30fcf'],
      start: '2021-04-01',
    },
    avax: {
      pools: ['0x4f01aed16d97e3ab5ab2b501154dc9bb0f1a5a2c'],
      start: '2021-09-21',
    },
  },
  "aave-v3": {
    ethereum: {
      pools: [
        '0x87870bca3f3fd6335c3f4ce8392d69350b4fa4e2', // core
        '0x4e033931ad43597d96d6bcc25c280717730b58b1', // lido
        '0x0AA97c284e98396202b6A04024F5E2c65026F3c0', // ether.fi
        '0xAe05Cd22df81871bc7cC2a04BeCfb516bFe332C8', // horizon
      ],
      start: '2023-01-01',
    },
    optimism: {
      pools: ['0x794a61358d6845594f94dc1db02a252b5b4814ad'],
      start: '2022-03-12',
    },
    arbitrum: {
      pools: ['0x794a61358d6845594f94dc1db02a252b5b4814ad'],
      start: '2022-03-12',
    },
    polygon: {
      pools: ['0x794a61358d6845594f94dc1db02a252b5b4814ad'],
      start: '2022-03-12',
    },
    avax: {
      pools: ['0x794a61358d6845594f94dc1db02a252b5b4814ad'],
      start: '2022-03-12',
    },
    fantom: {
      pools: ['0x794a61358d6845594f94dc1db02a252b5b4814ad'],
      start: '2022-03-12',
    },
    base: {
      pools: ['0xa238dd80c259a72e81d7e4664a9801593f98d1c5'],
      start: '2023-08-09',
    },
    bsc: {
      pools: ['0x6807dc923806fe8fd134338eabca509979a7e0cb'],
      start: '2023-11-18',
    },
    metis: {
      pools: ['0x90df02551bb792286e8d4f13e0e357b4bf1d6a57'],
      start: '2023-04-24',
    },
    xdai: {
      pools: ['0xb50201558b00496a145fe76f7424749556e326d8'],
      start: '2023-10-05',
    },
    scroll: {
      pools: ['0x11fCfe756c05AD438e312a7fd934381537D3cFfe'],
      start: '2024-01-21',
    },
    era: {
      pools: ['0x78e30497a3c7527d953c6B1E3541b021A98Ac43c'],
      start: '2024-09-09',
    },
    linea: {
      pools: ['0xc47b8C00b0f69a36fa203Ffeac0334874574a8Ac'],
      start: '2024-11-24',
    },
    sonic: {
      pools: ['0x5362dBb1e601abF3a4c14c22ffEdA64042E5eAA3'],
      start: '2025-02-16',
    },
    celo: {
      pools: ['0x3E59A31363E2ad014dcbc521c4a0d5757d9f3402'],
      start: '2025-02-16',
    },
    soneium: {
      pools: ['0xDd3d7A7d03D9fD9ef45f3E587287922eF65CA38B'],
      start: '2025-05-14',
    },
    plasma: {
      pools: ['0x925a2A7214Ed92428B5b1B090F80b25700095e12'],
      start: '2025-09-25',
    },
    megaeth: {
      pools: ['0x7e324AbC5De01d112AfC03a584966ff199741C28'],
      start: '2026-02-09',
    },
    mantle: {
      pools: ['0x458F293454fE0d67EC0655f3672301301DD51422'],
      start: '2026-01-16',
    },
  },
  "kinza-finance": {
    bsc: {
      pools: ['0xcb0620b181140e57d1c0d8b724cde623ca963c8c'],
      start: '2023-09-01',
    },
    op_bnb: {
      pools: ['0x3Aadc38eBAbD6919Fbd00C118Ae6808CBfE441CB'],
      start: '2023-10-12',
    },
    ethereum: {
      pools: ['0xeA14474946C59Dee1F103aD517132B3F19Cef1bE'],
      start: '2024-03-26',
    },
    mantle: {
      pools: ['0x5757b15f60331eF3eDb11b16ab0ae72aE678Ed51'],
      start: '2024-05-17',
    },
  },
  "lendle": {
    mantle: { pools: ['0xCFa5aE7c2CE8Fadc6426C1ff872cA45378Fb7cF3'], start: '2023-07-21' }
  },
  "spark": {
    ethereum: {
      pools: ['0xC13e21B648A5Ee794902342038FF3aDAB66BE987'],
      start: '2023-03-08',
    },
    xdai: {
      pools: ['0x2Dae5307c5E3FD1CF5A72Cb6F698f915860607e0'],
      start: '2023-09-06',
    },
  },
  "zerolend": {
    ethereum: {
      pools: [
        '0x3bc3d34c32cc98bf098d832364df8a222bbab4c0',
        '0xCD2b31071119D7eA449a9D211AC8eBF7Ee97F987',
        '0xD3a4DA66EC15a001466F324FA08037f3272BDbE8',
      ],
      start: '2024-03-04',
    },
    blast: {
      pools: ['0xa70b0f3c2470abbe104bdb3f3aaa9c7c54bea7a8'],
      start: '2024-03-01',
    },
    linea: {
      pools: [
        '0x2f9bb73a8e98793e26cb2f6c4ad037bdf1c6b269',
        '0xc6ff96AefD1cC757d56e1E8Dcc4633dD7AA5222D',
      ],
      start: '2024-03-10',
    },
    era: {
      pools: ['0x4d9429246ea989c9cee203b43f6d1c7d83e3b8f8'],
      start: '2023-07-17',
    },
    manta: {
      pools: ['0x2f9bb73a8e98793e26cb2f6c4ad037bdf1c6b269'],
      start: '2024-01-01',
    },
    base: {
      pools: ['0x766f21277087E18967c1b10bF602d8Fe56d0c671'],
      start: '2024-09-24',
    },
    zircuit: {
      pools: ['0x2774C8B95CaB474D0d21943d83b9322Fb1cE9cF5'],
      start: '2024-09-05',
    },
    corn: {
      pools: ['0x927b3A8e5068840C9758b0b88207b28aeeb7a3fd'],
      start: '2024-12-11',
    },
    berachain: {
      pools: ['0xE96Feed449e1E5442937812f97dB63874Cd7aB84'],
      start: '2025-02-11',
    },
    abstract: {
      pools: ['0x7C4baE19949D77B7259Dc4A898e64DC5c2d10b02'],
      start: '2025-05-14',
    },
    hemi: {
      pools: ['0xdB7e029394a7cdbE27aBdAAf4D15e78baC34d6E8'],
      start: '2025-03-12',
    },
  },
  "seamless-v1": {
    base: {
      pools: ['0x8F44Fd754285aa6A2b8B9B97739B79746e0475a7'],
      start: '2023-09-01',
    },
  },
  "pac-finance": {
    blast: {
      pools: ['0xd2499b3c8611E36ca89A70Fda2A72C49eE19eAa8'],
      start: '2024-03-01',
    },
  },
  "hyperlend": {
    hyperliquid: {
      pools: ['0x00A89d7a5A02160f20150EbEA7a2b5E4879A1A8b'],
      start: '2025-03-22',
    },
  },
  "sakefinance": {
    soneium: {
      pools: ['0x3C3987A310ee13F7B8cBBe21D97D4436ba5E4B5f', '0x0Bd12d3C4E794cf9919618E2bC71Bdd0C4FF1cF6'],
      start: '2025-01-09',
    },
  },
  "hyperyield": {
    hyperliquid: {
      pools: ['0x8Cc02b048deA40d8D0D13eac9866F5bb42D3F4E9', '0xC0Fd3F8e8b0334077c9f342671be6f1a53001F12'],
      start: '2025-03-04',
    },
  },
  "hypurrfi": {
    hyperliquid: {
      pools: ['0xcecce0eb9dd2ef7996e01e25dd70e461f918a14b'],
      start: '2025-02-20',
    },
  },
  "extra-finance-xlend": {
    optimism: {
      pools: ['0x345D2827f36621b02B783f7D5004B4a2fec00186'],
      start: '2024-11-07',
    },
    base: {
      pools: ['0x09b11746DFB1b5a8325e30943F8B3D5000922E03'],
      start: '2024-03-01',
    },
  },
  "vicuna-lending": {
    sonic: {
      pools: ['0xaa1C02a83362BcE106dFf6eB65282fE8B97A1665', '0x220fc1bEcC9bbE1a9dD81795F0505cC36E1B2563', '0x3C7FEA4d4c3EbBf19E73b6C99CE4B8884B87Bfa6'],
      start: '2025-02-07',
    },
  },
  "avalon": {
    merlin: {
      pools: ['0xea5c99a3cca5f95ef6870a1b989755f67b6b1939', '0x155d50D9c1D589631eA4E2eaD744CE82622AD9D3', '0xdCB0FAA822B99B87E630BF47399C5a0bF3C642cf'],
      start: '2024-03-20',
    },
    bitlayer: {
      pools: ['0xEA5c99A3cca5f95Ef6870A1B989755f67B6B1939', '0xeD6d6d18F20f8b419B5442C43D3e48EE568dEc14', '0xC486115C7db399F0e080A3713BF01B65CC8A5b64'],
      start: '2024-05-06',
    },
    core: {
      pools: ['0x67197de79b2a8fc301bab591c78ae5430b9704fd', '0x2f3552CE2F071B642Deeae5c84eD2EEe3Ed08D43', '0x7f6f0e50dB09C49027314103aa5a8F6Db862dBd0'],
      start: '2024-05-22',
    },
    bsc: {
      pools: ['0xf9278c7c4aefac4ddfd0d496f7a1c39ca6bca6d4', '0x77fF9B0cdbb6039b9D42d92d7289110E6CCD3890', '0xeCaC6332e2De19e8c8e6Cd905cb134E980F18cC4', '0x795Ae4Bd3B63aA8657a7CC2b3e45Fb0F7c9ED9Cc', '0x05C194eE95370ED803B1526f26EFd98C79078ab5', '0x6935B1196426586b527c8D13Ce42ff12eEc2A5fC', '0x4B801fb6f0830D070f40aff9ADFC8f6939Cc1F8D', '0x390166389f5D30281B9bDE086805eb3c9A10F46F', '0x54925C6dDeB73A962B3C3A21B10732eD5548e43a'],
      start: '2024-05-14',
    },
    taiko: {
      pools: ['0xA7f1c55530B1651665C15d8104663B3f03E3386f', '0x9dd29AA2BD662E6b569524ba00C55be39e7B00fB'],
      start: '2025-01-18',
    },
    sonic: {
      pools: ['0x6CCE1BC3fe54C9B1915e5f01ee076E4c4C3Cdd19', '0x974E2B16ddbF0ae6F78b4534353c2871213f2Dc9'],
      start: '2024-12-17',
    },
    bob: {
      pools: ['0x35B3F1BFe7cbE1e95A3DC2Ad054eB6f0D4c879b6', '0x6d8fE6EAa893860aA1B877A8cA4f0A6cbd4249f7', '0x99a05a9210B2861ccED5db7696eED3f4D73EB70c'],
      start: '2024-07-29',
    },
    arbitrum: {
      pools: ['0xe1ee45db12ac98d16f1342a03c93673d74527b55', '0x4B801fb6f0830D070f40aff9ADFC8f6939Cc1F8D'],
      start: '2024-05-13',
    },
    ethereum: {
      pools: ['0x35B3F1BFe7cbE1e95A3DC2Ad054eB6f0D4c879b6', '0x1c8091b280650aFc454939450699ECAA67C902d9', '0xE0E468687703dD02BEFfB0BE13cFB109529F38e0'],
      start: '2024-07-17',
    },
    mode: {
      pools: ['0x7454E4ACC4B7294F740e33B81224f50C28C29301', '0x2c373aAB54b547Be9b182e795bed34cF9955dc34'],
      start: '2024-11-12',
    },
    bsquared: {
      pools: ['0xC0843a5A8527FD7221256893D4a4305145937E8c'],
      start: '2024-10-30',
    },
    base: {
      pools: ['0x6374a1F384737bcCCcD8fAE13064C18F7C8392e5'],
      start: '2024-09-20',
    },
    scroll: {
      pools: ['0xA90FB5234A659b7e5738775F8B48f8f833b3451C'],
      start: '2024-05-28',
    },
    iotex: {
      pools: ['0x29ee512b76f58ff4d281c49c7d1b6b248c79f009', '0x99a05a9210B2861ccED5db7696eED3f4D73EB70c', '0x4B801fb6f0830D070f40aff9ADFC8f6939Cc1F8D'],
      start: '2024-10-22',
    },
    klaytn: {
      pools: ['0xCf1af042f2A071DF60a64ed4BdC9c7deE40780Be', '0x4659F938458afB37F3340270FC9CdFe665809c1b'],
      start: '2024-11-18',
    },
    zeta: {
      pools: ['0x6935B1196426586b527c8D13Ce42ff12eEc2A5fC', '0x7454E4ACC4B7294F740e33B81224f50C28C29301'],
      start: '2024-11-16',
    },
    corn: {
      pools: ['0xd412D77A4920317ffb3F5deBAD29B1662FBA53DF', '0xd63C731c8fBC672B69257f70C47BD8e82C9efBb8', '0xdef0EB584700Fc81C73ACcd555cB6cea5FB85C3e', '0xC1bFbF4E0AdCA79790bfa0A557E4080F05e2B438'],
      start: '2024-12-13',
    },
    duckchain: {
      pools: ['0x6d8fE6EAa893860aA1B877A8cA4f0A6cbd4249f7', '0xbA41c92B8FE13f806974cd9fd3F285B0b8b44495'],
      start: '2024-01-01',
    },
    sei: {
      pools: ['0xE5eB6aBbA365A49C8624532acaed54A47cc36D3C'],
      start: '2025-01-06',
    },
  },
  "neverland": {
    monad: {
      pools: ['0x80F00661b13CC5F6ccd3885bE7b4C9c67545D585'],
      start: '2025-11-23',
    },
  },
  "unleash-protocol": {
    story: {
      pools: ['0xC62Af8aa9E2358884B6e522900F91d3c924e1b38'],
      start: '2025-02-13',
    },
  },
  "tokos-fi": {
    somnia: {
      pools: ['0xEC6758e6324c167DB39B6908036240460a2b0168'],
      start: '2025-09-11',
    },
  },
  "superlend": {
    etherlink: {
      pools: ['0x3bD16D195786fb2F509f2E2D7F69920262EF114D'],
      start: '2024-10-04',
    },
  },
  "realt-rmm-marketplace": {
    xdai: {
      pools: ['0x5B8D36De471880Ee21936f328AAB2383a280CB2A'],
      start: '2022-01-22',
    },
  },
  "realt-rmm-marketplace-v2": {
    xdai: {
      pools: ['0xFb9b496519fCa8473fba1af0850B6B8F476BFdB3'],
      start: '2024-01-23',
    },
  },
  "lava": {
    arbitrum: {
      pools: ['0x3Ff516B89ea72585af520B64285ECa5E4a0A8986'],
      start: '2024-04-02',
    },
  },
  "more-markets": {
    flow: {
      pools: ['0xbC92aaC2DBBF42215248B5688eB3D3d2b32F2c8d'],
      start: '2025-01-14',
    },
  },
  "colend-protocol": {
    core: {
      pools: ['0x0cea9f0f49f30d376390e480ba32f903b43b19c5'],
      start: '2024-04-16',
    },
  },
};

const protocols: Record<string, any> = {};
for (const [name, config] of Object.entries(configs)) {
  protocols[name] = aaveLiquidationsExport(config);
}

export const { protocolList, getAdapter } = createFactoryExports(protocols);
