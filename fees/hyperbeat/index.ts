import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getCuratorExport } from "../../helpers/curators";

const HBUSDT_PRICE_AGGREGATOR = "0xAc3d811f5ff30Aa3ab4b26760d0560faf379536A";
const HBUSDT = "0x5e105266db42f78FA814322Bce7f388B4C2e61eb"
const HBXAUT_PRICE_AGGREGATOR = "0xf3dB9f59f9C90495D1c9556fC5737A679720921d"
const HBXAUT = "0x6EB6724D8D3D4FF9E24d872E8c38403169dC05f8"
const HBLSTHYPE_PRICE_AGGREGATOR = "0x2b959a9Deb8e62FaaEA1b226F3bbcbcC0Af31560"
const HBLSTHYPE = "0x81e064d0eB539de7c3170EDF38C1A42CBd752A76"
const LIQUIDHYPE_PRICE_AGGREGATOR = "0x1CeaB703956e24b18a0AF6b272E0bF3F499aCa0F"
const LIQUIDHYPE = "0x441794D6a8F9A3739F5D4E98a728937b33489D29"
const HBHYPE = "0x96C6cBB6251Ee1c257b2162ca0f39AA5Fa44B1FB"
const HBHYPE_PRICE_AGGREGATOR = "0xDb924A25BfF353f98B066F692c38C3cFacb3a601"
const hbBTC = "0xc061d38903b99aC12713B550C2CB44B221674F94"
const hbBTC_PRICE_AGGREGATOR = "0x9ED559c2Ad1562aE8e919691A84A3320f547B248"
const dnPUMP = "0x8858a307a85982c2b3cb2ace1720237f2f09c39b"
const dnPUMP_PRICE_AGGREGATOR = "0x707e99655f24747ceceb298b3aaf7fa721ec77fc"
const dnHYPE = "0x949a7250Bb55Eb79BC6bCC97fCd1C473DB3e6F29"
const dnHYPE_PRICE_AGGREGATOR = "0xEB3459316211aB3e2bfee836B989f50fe08AA469"
const wVLP = "0xD66d69c288d9a6FD735d7bE8b2e389970fC4fD42"
const wVLP_PRICE_AGGREGATOR = "0xa9ffe62e785324cb39cb5e2b3ef713674391d31f"
const hbUSDC = "0x057ced81348D57Aad579A672d521d7b4396E8a61"
const hbUSDC_PRICE_AGGREGATOR = "0xc82CAd78983436BddfcAf0F21316207D87b87462"


// const MORPHO_VAULT_CURATORS = [
  // '0xb830B8B1A41c38603dBC6E4b562Ff599eDB415C4', // MEV Capital
  // '0x6293e97900aA987Cf3Cbd419e0D5Ba43ebfA91c1', // MEV Capital (additional)
  // '0xe3ea927a0f41B4a84fA9900812E52F8BcB84f396', // Gauntlet
  // '0xA4362C5F624F8f50DB23E9FE99FDEC2627cB36Fd', // Relend Network
  // '0x75178137D3B4B9A0F771E0e149b00fB8167BA325', // Hyperithm
  // '0x036845F9BE6DF938Da01Abe33e056D3CcaA836a2', // Re7 Labs
// ];

// Hyperbeat deployed these vaults from begining and supported by these curators like Gauntlet, MEV Capital, ...
// we count these Morpho vaults fees & revenue to Hyperbeat
const MORPHO_VAULTS = [
  '0xe5ADd96840F0B908ddeB3Bd144C0283Ac5ca7cA0',
  '0x4346C98E690c17eFbB999aE8e1dA96B089bE320b',
  '0x92B518e1cD76dD70D3E20624AEdd7D107F332Cff',
  '0x0571362ba5EA9784a97605f57483f865A37dBEAA',
  '0xD3A9Cb7312B9c29113290758f5ADFe12304cd16A',
  '0x3Bcc0a5a66bB5BdCEEf5dd8a659a4eC75F3834d8',
  '0xd19e3d00f8547f7d108abFD4bbb015486437B487',
  '0x53A333e51E96FE288bC9aDd7cdC4B1EAD2CD2FfA',
  '0x5eEC795d919FA97688Fb9844eeB0072E6B846F9d',
  '0x08C00F8279dFF5B0CB5a04d349E7d79708Ceadf3',
  '0x264a06Fd7A7C9E0Bfe75163b475E2A3cc1856578',
  '0x182b318A8F1c7C92a7884e469442a610B0e69ed2',
  '0x4851D4891321035729713D43bE1F4bb883Dffd34',
  '0x51F64488d03D8B210294dA2BF70D5db0Bc621B0c',
]

const exchangeRateMidasAbi = "function lastAnswer() external view returns (int256)";
const exchangeRateUpshiftAbi = "function latestAnswer() external view returns (int256)";

const getTotalSupply = async (options: FetchOptions, target: string) => {
  return await options.api.call({
    target: target,
    abi: "function totalSupply() external view returns (uint256)",
  });
};

const getExchangeRateBeforeAfterVaults = async (options: FetchOptions, target: string, abi: string) => {
  const [exchangeRateBefore, exchangeRateAfter] = await Promise.all([
    options.fromApi.call({ target: target, abi: abi, params: [] }),
    options.toApi.call({ target: target, abi: abi, params: [] }),
  ])

  return [exchangeRateBefore, exchangeRateAfter]
}

const curatorAdapter = getCuratorExport({
  vaults: {
    [CHAIN.HYPERLIQUID]: {
      morpho: MORPHO_VAULTS,
    },
  }
})

const fetch = async (options: FetchOptions) => {
  const { dailyFees, dailyRevenue, dailySupplySideRevenue, dailyProtocolRevenue } = await (curatorAdapter.adapter as any)[options.chain].fetch(options);

  // liquidHYPE vault
  const totalSupply_liquidhype = await getTotalSupply(options, LIQUIDHYPE);
  const [exchangeRateBeforeLIQUIDHYPE, exchangeRateAfterLIQUIDHYPE] = await getExchangeRateBeforeAfterVaults(options, LIQUIDHYPE_PRICE_AGGREGATOR, exchangeRateMidasAbi);
  dailyFees.addCGToken('hyperliquid', (totalSupply_liquidhype / 1e18) * (exchangeRateAfterLIQUIDHYPE / 1e8 - exchangeRateBeforeLIQUIDHYPE / 1e8));

  // // hbusdt vault
  const totalSupply_hbusdt = await getTotalSupply(options, HBUSDT);
  const [exchangeRateBeforeHBUSDT, exchangeRateAfterHBUSDT] = await getExchangeRateBeforeAfterVaults(options, HBUSDT_PRICE_AGGREGATOR, exchangeRateMidasAbi);
  dailyFees.addCGToken('usdt0', (totalSupply_hbusdt / 1e18) * (exchangeRateAfterHBUSDT / 1e8 - exchangeRateBeforeHBUSDT / 1e8));
  dailySupplySideRevenue.addCGToken('usdt0', (totalSupply_hbusdt / 1e18) * (exchangeRateAfterHBUSDT / 1e8 - exchangeRateBeforeHBUSDT / 1e8));

  // // hbxaut vault
  const totalSupply_hbxaut = await getTotalSupply(options, HBXAUT);
  const [exchangeRateBeforeHBXAUT, exchangeRateAfterHBXAUT] = await getExchangeRateBeforeAfterVaults(options, HBXAUT_PRICE_AGGREGATOR, exchangeRateMidasAbi);
  dailyFees.addCGToken('xaut', (totalSupply_hbxaut / 1e18) * (exchangeRateAfterHBXAUT / 1e8 - exchangeRateBeforeHBXAUT / 1e8));
  dailySupplySideRevenue.addCGToken('xaut', (totalSupply_hbxaut / 1e18) * (exchangeRateAfterHBXAUT / 1e8 - exchangeRateBeforeHBXAUT / 1e8));

  // //hblsthype vault
  const totalSupply_hblsthype = await getTotalSupply(options, HBLSTHYPE);
  const [exchangeRateBeforeHBLSTHYPE, exchangeRateAfterHBLSTHYPE] = await getExchangeRateBeforeAfterVaults(options, HBLSTHYPE_PRICE_AGGREGATOR, exchangeRateMidasAbi);
  dailyFees.addCGToken('kinetic-staked-hype', (totalSupply_hblsthype / 1e18) * (exchangeRateAfterHBLSTHYPE / 1e8 - exchangeRateBeforeHBLSTHYPE / 1e8));
  dailySupplySideRevenue.addCGToken('kinetic-staked-hype', (totalSupply_hblsthype / 1e18) * (exchangeRateAfterHBLSTHYPE / 1e8 - exchangeRateBeforeHBLSTHYPE / 1e8));

  // //hbhype vault
  const totalSupply_hbhype = await getTotalSupply(options, HBHYPE);
  const [exchangeRateBeforeHBHYPE, exchangeRateAfterHBHYPE] = await getExchangeRateBeforeAfterVaults(options, HBHYPE_PRICE_AGGREGATOR, exchangeRateUpshiftAbi);
  dailyFees.addCGToken('hyperliquid', (totalSupply_hbhype / 1e18) * (exchangeRateAfterHBHYPE / 1e8 - exchangeRateBeforeHBHYPE / 1e8));
  dailySupplySideRevenue.addCGToken('hyperliquid', (totalSupply_hbhype / 1e18) * (exchangeRateAfterHBHYPE / 1e8 - exchangeRateBeforeHBHYPE / 1e8));

  // // hbbtc vault
  const totalSupply_hbbtc = await getTotalSupply(options, hbBTC);
  const [exchangeRateBeforeHBTC, exchangeRateAfterHBTC] = await getExchangeRateBeforeAfterVaults(options, hbBTC_PRICE_AGGREGATOR, exchangeRateUpshiftAbi);
  dailyFees.addCGToken('unit-bitcoin', (totalSupply_hbbtc / 1e18) * (exchangeRateAfterHBTC / 1e8 - exchangeRateBeforeHBTC / 1e8));
  dailySupplySideRevenue.addCGToken('unit-bitcoin', (totalSupply_hbbtc / 1e18) * (exchangeRateAfterHBTC / 1e8 - exchangeRateBeforeHBTC / 1e8));

  // // dnPUMP vault (Midas)
  const totalSupply_dnpump = await getTotalSupply(options, dnPUMP);
  const [exchangeRateBeforeDNPUMP, exchangeRateAfterDNPUMP] = await getExchangeRateBeforeAfterVaults(options, dnPUMP_PRICE_AGGREGATOR, exchangeRateMidasAbi);
  dailyFees.addCGToken('usd-coin', (totalSupply_dnpump / 1e18) * (exchangeRateAfterDNPUMP / 1e8 - exchangeRateBeforeDNPUMP / 1e8));
  dailySupplySideRevenue.addCGToken('usd-coin', (totalSupply_dnpump / 1e18) * (exchangeRateAfterDNPUMP / 1e8 - exchangeRateBeforeDNPUMP / 1e8));

  // // dnHYPE vault (Midas)
  const totalSupply_dnhype = await getTotalSupply(options, dnHYPE);
  const [exchangeRateBeforeDNHYPE, exchangeRateAfterDNHYPE] = await getExchangeRateBeforeAfterVaults(options, dnHYPE_PRICE_AGGREGATOR, exchangeRateMidasAbi);
  dailyFees.addCGToken('usd-coin', (totalSupply_dnhype / 1e18) * (exchangeRateAfterDNHYPE / 1e8 - exchangeRateBeforeDNHYPE / 1e8));
  dailySupplySideRevenue.addCGToken('usd-coin', (totalSupply_dnhype / 1e18) * (exchangeRateAfterDNHYPE / 1e8 - exchangeRateBeforeDNHYPE / 1e8));

  // // wVLP vault (Midas)
  const totalSupply_wvlp = await getTotalSupply(options, wVLP);
  const [exchangeRateBeforeWVLP, exchangeRateAfterWVLP] = await getExchangeRateBeforeAfterVaults(options, wVLP_PRICE_AGGREGATOR, exchangeRateMidasAbi);
  dailyFees.addCGToken('usd-coin', (totalSupply_wvlp / 1e18) * (exchangeRateAfterWVLP / 1e8 - exchangeRateBeforeWVLP / 1e8));
  dailySupplySideRevenue.addCGToken('usd-coin', (totalSupply_wvlp / 1e18) * (exchangeRateAfterWVLP / 1e8 - exchangeRateBeforeWVLP / 1e8));

  // // hbUSDC vault (Midas)
  const totalSupply_hbusdc = await getTotalSupply(options, hbUSDC);
  const [exchangeRateBeforeHBUSDC, exchangeRateAfterHBUSDC] = await getExchangeRateBeforeAfterVaults(options, hbUSDC_PRICE_AGGREGATOR, exchangeRateMidasAbi);
  dailyFees.addCGToken('usd-coin', (totalSupply_hbusdc / 1e18) * (exchangeRateAfterHBUSDC / 1e8 - exchangeRateBeforeHBUSDC / 1e8));
  dailySupplySideRevenue.addCGToken('usd-coin', (totalSupply_hbusdc / 1e18) * (exchangeRateAfterHBUSDC / 1e8 - exchangeRateBeforeHBUSDC / 1e8));

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue,
    dailySupplySideRevenue,
  };
};

const adapter: Adapter = {
  version: 2,
  methodology: {
    Fees: "Staking/Restaking rewards + fees on Liquid/Morpho Vaults (excluding beHYPE).",
    Revenue: "Staking/Restaking rewards + fees on Liquid/Morpho Vaults (excluding beHYPE) share for Hyperbeat.",
    ProtocolRevenue: "Staking/Restaking rewards + fees on Liquid/Morpho Vaults (excluding beHYPE) share for Hyperbeat.",
    SupplySideRevenue: "Staking/Restaking rewards + fees on Liquid/Morpho Vaults (excluding beHYPE) share for suppliers.",
  },
  fetch,
  chains: [CHAIN.HYPERLIQUID],
  start: '2025-05-01',
};

export default adapter;