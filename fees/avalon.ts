import { SimpleAdapter } from "../adapters/types";
import { aaveExport, AaveLendingPoolConfig, } from "../helpers/aave";
import { CHAIN } from "../helpers/chains";

const AvalonMarkets: {[key: string]: Array<AaveLendingPoolConfig>} = {
  [CHAIN.MERLIN]: [
    {
      version: 3,
      lendingPoolProxy: '0xea5c99a3cca5f95ef6870a1b989755f67b6b1939',
      dataProvider: '0x5f314b36412765f3e1016632fd1ad528929536ca',
    },
    {
      version: 3,
      lendingPoolProxy: '0x155d50D9c1D589631eA4E2eaD744CE82622AD9D3',
      dataProvider: '0x623700Fee1dF64088f258e2c4DAB4D6aEac4dDA6',
    },
    {
      version: 3,
      lendingPoolProxy: '0xdCB0FAA822B99B87E630BF47399C5a0bF3C642cf',
      dataProvider: '0x883cb2E2d9c5D4D9aF5b0d37fc39Fa2284405682',
    },
  ],
  [CHAIN.BITLAYER]: [
    {
      version: 3,
      lendingPoolProxy: '0xEA5c99A3cca5f95Ef6870A1B989755f67B6B1939',
      dataProvider: '0x5F314b36412765f3E1016632fD1Ad528929536CA',
    },
    {
      version: 3,
      lendingPoolProxy: '0xeD6d6d18F20f8b419B5442C43D3e48EE568dEc14',
      dataProvider: '0x4c25c261Fe47bC216113D140BaF72B05E151bcE4',
    },
    {
      version: 3,
      lendingPoolProxy: '0xC486115C7db399F0e080A3713BF01B65CC8A5b64',
      dataProvider: '0x898D0EF6E20B7597728AEB41169c22608Fe4b234',
    },
    {
      version: 3,
      lendingPoolProxy: '0xeD6d6d18F20f8b419B5442C43D3e48EE568dEc14',
      dataProvider: '0x4c25c261Fe47bC216113D140BaF72B05E151bcE4',
    },
  ],
  [CHAIN.CORE]: [
    {
      version: 3,
      lendingPoolProxy: '0x67197de79b2a8fc301bab591c78ae5430b9704fd',
      dataProvider: '0x802cb61844325dc9a161bc3a498e3be1b7b6fe00',
    },
    {
      version: 3,
      lendingPoolProxy: '0x2f3552CE2F071B642Deeae5c84eD2EEe3Ed08D43',
      dataProvider: '0x5c78EbB34cC5b52146D107365A66E37a677Fcf50',
    },
    {
      version: 3,
      lendingPoolProxy: '0x7f6f0e50dB09C49027314103aa5a8F6Db862dBd0',
      dataProvider: '0x2752237ccC6aB5e4B9e9BFca57D7a6956aF4FE3d',
    },
  ],
  [CHAIN.BSC]: [
    {
      version: 3,
      lendingPoolProxy: '0xf9278c7c4aefac4ddfd0d496f7a1c39ca6bca6d4',
      dataProvider: '0x672b19dda450120c505214d149ee7f7b6ded8c39',
    },
    {
      version: 3,
      lendingPoolProxy: '0x77fF9B0cdbb6039b9D42d92d7289110E6CCD3890',
      dataProvider: '0x9515dC23bBE46f9C9885D24Fa276745A11b7f9D8',
    },
    {
      version: 3,
      lendingPoolProxy: '0xeCaC6332e2De19e8c8e6Cd905cb134E980F18cC4',
      dataProvider: '0x58c937fa2D147117dB43d187f9411151edfFf03c',
    },
    {
      version: 3,
      lendingPoolProxy: '0x795Ae4Bd3B63aA8657a7CC2b3e45Fb0F7c9ED9Cc',
      dataProvider: '0xF828A73cB00072843241C6294ed778F26854fe5C',
    },
    {
      version: 3,
      lendingPoolProxy: '0x05C194eE95370ED803B1526f26EFd98C79078ab5',
      dataProvider: '0x56F817eF5D1945E0772496020ff0F72c3984B351',
    },
    {
      version: 3,
      lendingPoolProxy: '0x6935B1196426586b527c8D13Ce42ff12eEc2A5fC',
      dataProvider: '0xA34F1a928024E3609C8968fEA90C747e8D1fA20f',
    },
    {
      version: 3,
      lendingPoolProxy: '0x4B801fb6f0830D070f40aff9ADFC8f6939Cc1F8D',
      dataProvider: '0x2c4aEB7C9f0D196a51136B3c7bec49cB2DBD1966',
    },
    {
      version: 3,
      lendingPoolProxy: '0x390166389f5D30281B9bDE086805eb3c9A10F46F',
      dataProvider: '0x5b9b3C211B81627Cc6b46824CB26829F31A587dc',
    },
    {
      version: 3,
      lendingPoolProxy: '0x54925C6dDeB73A962B3C3A21B10732eD5548e43a',
      dataProvider: '0x5157f63bE7808DEB090Eee7762e917745896A09E',
    },
  ],
  [CHAIN.TAIKO]: [
    {
      version: 3,
      lendingPoolProxy: '0xA7f1c55530B1651665C15d8104663B3f03E3386f',
      dataProvider: '0x43248dF19B9B55f7b488CF68A1224308Af2D81eC',
    },
    {
      version: 3,
      lendingPoolProxy: '0x9dd29AA2BD662E6b569524ba00C55be39e7B00fB',
      dataProvider: '0xF6Aa54a5b60c324602C9359E8221423793e5205d',
    },
  ],
  [CHAIN.SONIC]: [
    {
      version: 3,
      lendingPoolProxy: '0x6CCE1BC3fe54C9B1915e5f01ee076E4c4C3Cdd19',
      dataProvider: '0x28350E38f241d7F24106CE5eaB1684D6ebEB4700',
    },
    {
      version: 3,
      lendingPoolProxy: '0x974E2B16ddbF0ae6F78b4534353c2871213f2Dc9',
      dataProvider: '0x23f02C2eeFe2010298Ab74059393326d3df59a02',
    },
  ],
  [CHAIN.BOB]: [
    {
      version: 3,
      lendingPoolProxy: '0x35B3F1BFe7cbE1e95A3DC2Ad054eB6f0D4c879b6',
      dataProvider: '0xfabb0fDca4348d5A40EB1BB74AEa86A1C4eAd7E2',
    },
    {
      version: 3,
      lendingPoolProxy: '0x6d8fE6EAa893860aA1B877A8cA4f0A6cbd4249f7',
      dataProvider: '0x100AC26ad2c253B18375f1dC4BC0EeeB66DEBc88',
    },
    {
      version: 3,
      lendingPoolProxy: '0x99a05a9210B2861ccED5db7696eED3f4D73EB70c',
      dataProvider: '0x28292e1ca36e400FB7d0B66AaA99EB808E3Cb8cB',
    },
  ],
  [CHAIN.ARBITRUM]: [
    {
      version: 3,
      lendingPoolProxy: '0xe1ee45db12ac98d16f1342a03c93673d74527b55',
      dataProvider: '0xec579d2ce07401258710199ff12a5bb56e086a6f',
    },
    {
      version: 3,
      lendingPoolProxy: '0x4B801fb6f0830D070f40aff9ADFC8f6939Cc1F8D',
      dataProvider: '0x2c4aEB7C9f0D196a51136B3c7bec49cB2DBD1966',
    },
  ],
  [CHAIN.ETHEREUM]: [
    {
      version: 3,
      lendingPoolProxy: '0x35B3F1BFe7cbE1e95A3DC2Ad054eB6f0D4c879b6',
      dataProvider: '0xfabb0fDca4348d5A40EB1BB74AEa86A1C4eAd7E2',
    },
    {
      version: 3,
      lendingPoolProxy: '0x1c8091b280650aFc454939450699ECAA67C902d9',
      dataProvider: '0x2eE0438BCC1876cEA2c6fc43dD21417cF3D1c2eF',
    },
    {
      version: 3,
      lendingPoolProxy: '0xE0E468687703dD02BEFfB0BE13cFB109529F38e0',
      dataProvider: '0x87Ed94868f6fbaA834Db81a1C5854c445caCaB67',
    },
  ],
  [CHAIN.MODE]: [
    {
      version: 3,
      lendingPoolProxy: '0x7454E4ACC4B7294F740e33B81224f50C28C29301',
      dataProvider: '0xC5b05b7092257Ee3eEAf013198d30F1E8179B6C9',
    },
    {
      version: 3,
      lendingPoolProxy: '0x2c373aAB54b547Be9b182e795bed34cF9955dc34',
      dataProvider: '0x8F016F5dac399F20B34E35CBaF1dFf12eeE2dE74',
    },
  ],
  [CHAIN.BSQUARED]: [
    {
      version: 3,
      lendingPoolProxy: '0xC0843a5A8527FD7221256893D4a4305145937E8c',
      dataProvider: '0x4Ea93E846b8C6E7b3D5a5BEDF4fe6B8AED58FCEe',
    },
  ],
  [CHAIN.BASE]: [
    {
      version: 3,
      lendingPoolProxy: '0x6374a1F384737bcCCcD8fAE13064C18F7C8392e5',
      dataProvider: '0xA9D15C669940a757Ab76C6604f2f8f1e198f7D50',
    },
  ],
  [CHAIN.SCROLL]: [
    {
      version: 3,
      lendingPoolProxy: '0xA90FB5234A659b7e5738775F8B48f8f833b3451C',
      dataProvider: '0x18cbe70602Ee17f79D56971F685E9EaF49DA53F2',
    },
  ],
  [CHAIN.IOTEX]: [
    {
      version: 3,
      lendingPoolProxy: '0x29ee512b76f58ff4d281c49c7d1b6b248c79f009',
      dataProvider: '0xBa77520d38953BF6a8395D118CfF714Ed672533f',
    },
    {
      version: 3,
      lendingPoolProxy: '0x99a05a9210B2861ccED5db7696eED3f4D73EB70c',
      dataProvider: '0x28292e1ca36e400FB7d0B66AaA99EB808E3Cb8cB',
    },
    {
      version: 3,
      lendingPoolProxy: '0x4B801fb6f0830D070f40aff9ADFC8f6939Cc1F8D',
      dataProvider: '0x2c4aEB7C9f0D196a51136B3c7bec49cB2DBD1966',
    },
  ],
  [CHAIN.KLAYTN]: [
    {
      version: 3,
      lendingPoolProxy: '0xCf1af042f2A071DF60a64ed4BdC9c7deE40780Be',
      dataProvider: '0xddD3D480521bc027596e078BCd1b838d50Daa076',
    },
    {
      version: 3,
      lendingPoolProxy: '0x4659F938458afB37F3340270FC9CdFe665809c1b',
      dataProvider: '0x276c5119f63119921667842dA3B71EE10Ac486eA',
    },
  ],
  [CHAIN.ZETA]: [
    {
      version: 3,
      lendingPoolProxy: '0x6935B1196426586b527c8D13Ce42ff12eEc2A5fC',
      dataProvider: '0xA34F1a928024E3609C8968fEA90C747e8D1fA20f',
    },
    {
      version: 3,
      lendingPoolProxy: '0x7454E4ACC4B7294F740e33B81224f50C28C29301',
      dataProvider: '0xC5b05b7092257Ee3eEAf013198d30F1E8179B6C9',
    },
  ],
  [CHAIN.CORN]: [
    {
      version: 3,
      lendingPoolProxy: '0xd412D77A4920317ffb3F5deBAD29B1662FBA53DF',
      dataProvider: '0x56552f4407113894Bfce34b5b88C57b941AFc519',
    },
    {
      version: 3,
      lendingPoolProxy: '0xd63C731c8fBC672B69257f70C47BD8e82C9efBb8',
      dataProvider: '0xf0d077728D424Ee6C6Eba82d23ce56C2e91E57Ea',
    },
    {
      version: 3,
      lendingPoolProxy: '0xdef0EB584700Fc81C73ACcd555cB6cea5FB85C3e',
      dataProvider: '0x867885c1dB3020E25A86Db7e20E35dC7b81d76A2',
    },
    {
      version: 3,
      lendingPoolProxy: '0xC1bFbF4E0AdCA79790bfa0A557E4080F05e2B438',
      dataProvider: '0x5EcDC2432ED77cD8E2cE6183712c5cc712c40ec0',
    },
  ],
  [CHAIN.DUCKCHAIN]: [
    {
      version: 3,
      lendingPoolProxy: '0x6d8fE6EAa893860aA1B877A8cA4f0A6cbd4249f7',
      dataProvider: '0x100AC26ad2c253B18375f1dC4BC0EeeB66DEBc88',
    },
    {
      version: 3,
      lendingPoolProxy: '0xbA41c92B8FE13f806974cd9fd3F285B0b8b44495',
      dataProvider: '0x912b425D867a09608A884C83b3D5075E9037Aa6a',
    },
  ],
  [CHAIN.SEI]: [
    {
      version: 3,
      lendingPoolProxy: '0xE5eB6aBbA365A49C8624532acaed54A47cc36D3C',
      dataProvider: '0x16b9b88B773C1a1aBA6D305e0560171405d45121',
    },
  ],
}

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    ...aaveExport({
      [CHAIN.ETHEREUM]: {
        pools: AvalonMarkets[CHAIN.ETHEREUM],
      },
      [CHAIN.BASE]: {
        pools: AvalonMarkets[CHAIN.BASE],
      },
      [CHAIN.ARBITRUM]: {
        pools: AvalonMarkets[CHAIN.ARBITRUM],
      },
      [CHAIN.BSC]: {
        pools: AvalonMarkets[CHAIN.BSC],
      },
      [CHAIN.MERLIN]: {
        pools: AvalonMarkets[CHAIN.MERLIN],
      },
      [CHAIN.BITLAYER]: {
        pools: AvalonMarkets[CHAIN.BITLAYER],
      },
      [CHAIN.BSQUARED]: {
        pools: AvalonMarkets[CHAIN.BSQUARED],
      },
      [CHAIN.MODE]: {
        pools: AvalonMarkets[CHAIN.MODE],
      },
      [CHAIN.TAIKO]: {
        pools: AvalonMarkets[CHAIN.TAIKO],
      },
      [CHAIN.SONIC]: {
        pools: AvalonMarkets[CHAIN.SONIC],
      },
      [CHAIN.BOB]: {
        pools: AvalonMarkets[CHAIN.BOB],
      },
      [CHAIN.CORE]: {
        pools: AvalonMarkets[CHAIN.CORE],
      },
      [CHAIN.SCROLL]: {
        pools: AvalonMarkets[CHAIN.SCROLL],
      },
      [CHAIN.IOTEX]: {
        pools: AvalonMarkets[CHAIN.IOTEX],
      },
      [CHAIN.KLAYTN]: {
        pools: AvalonMarkets[CHAIN.KLAYTN],
      },
      [CHAIN.ZETA]: {
        pools: AvalonMarkets[CHAIN.ZETA],
      },
      [CHAIN.CORN]: {
        pools: AvalonMarkets[CHAIN.CORN],
      },
      [CHAIN.DUCKCHAIN]: {
        pools: AvalonMarkets[CHAIN.DUCKCHAIN],
      },
      [CHAIN.SEI]: {
        pools: AvalonMarkets[CHAIN.SEI],
      },
    })
  }
}

export default adapter
