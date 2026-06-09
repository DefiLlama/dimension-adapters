import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getCuratorExport } from "../../helpers/curators";

const exchangeRateMidasAbi = "function lastAnswer() external view returns (int256)";
const exchangeRateUpshiftAbi = "function latestAnswer() external view returns (int256)";
const getRateAbi = "function getRate() external view returns (uint256)";

interface IStandaloneVault {
  address: string;
  assetCoingeckoId: string;
  priceFeed: string;
  priceFeedAbi: string;
  performanceFeeRate: number, // 0.1 -> 10%
}

// Vaults priced from a separate exchange-rate price feed (no getRate() pricer).
const StandaloneVaults: Array<IStandaloneVault> = [
  // https://docs.hyperbeat.org/hyperbeat-earn/hype-vault (liquidHYPE)
  {
    address: '0x441794D6a8F9A3739F5D4E98a728937b33489D29',
    priceFeed: '0x1CeaB703956e24b18a0AF6b272E0bF3F499aCa0F',
    assetCoingeckoId: 'hyperliquid',
    priceFeedAbi: exchangeRateMidasAbi,
    performanceFeeRate: 0.15,
  },
  {
    address: '0x96C6cBB6251Ee1c257b2162ca0f39AA5Fa44B1FB',
    priceFeed: '0xDb924A25BfF353f98B066F692c38C3cFacb3a601',
    assetCoingeckoId: 'hyperliquid',
    priceFeedAbi: exchangeRateUpshiftAbi,
    performanceFeeRate: 0.15,
  },
  // https://docs.hyperbeat.org/hyperbeat-earn/ubtc-vault
  {
    address: '0xc061d38903b99aC12713B550C2CB44B221674F94',
    priceFeed: '0x9ED559c2Ad1562aE8e919691A84A3320f547B248',
    assetCoingeckoId: 'unit-bitcoin',
    priceFeedAbi: exchangeRateUpshiftAbi,
    performanceFeeRate: 0.15,
  },
  // wVLP
  {
    address: '0xD66d69c288d9a6FD735d7bE8b2e389970fC4fD42',
    assetCoingeckoId: 'usd-coin',
    priceFeed: '0xa9ffe62e785324cb39cb5e2b3ef713674391d31f',
    priceFeedAbi: exchangeRateMidasAbi,
    performanceFeeRate: 0.20,
  },
]

interface IGetRateVault {
  address: string;            // vault share token
  pricer: string;             // contract exposing getRate() (8 decimals, base-asset per share)
  assetCoingeckoId: string;   // base asset, yield is denominated in it
  shareDecimals: number;
  performanceFeeRate: number; // 0.1 -> 10%
}

// Vaults whose share->asset rate is read from their getRate() pricer. getRate()
// is the rate depositors actually realize (no rebase), so daily yield =
// totalSupply * (getRate growth). Protocol fee is grossed up from that net yield.
const getRateVaults: Array<IGetRateVault> = [
  { address: '0x81e064d0eB539de7c3170EDF38C1A42CBd752A76', pricer: '0x5eD0eC0b0643dAB621Dc814C8D058e161b9b884b', assetCoingeckoId: 'hyperliquid', shareDecimals: 18, performanceFeeRate: 0.20 }, // lstHYPE
  { address: '0x5e105266db42f78FA814322Bce7f388B4C2e61eb', pricer: '0x3636a26ec1d512c5eCff42F7Adaa5cE7964C6579', assetCoingeckoId: 'usdt0', shareDecimals: 18, performanceFeeRate: 0.20 }, // hbUSDT
  { address: '0x057ced81348D57Aad579A672d521d7b4396E8a61', pricer: '0xe0995A641d454c149E6C808BAA37Cb2B38763316', assetCoingeckoId: 'usd-coin', shareDecimals: 18, performanceFeeRate: 0.20 }, // hbUSDC
  { address: '0x9065E3153B1393Bb5f76520cdc1e08E49eb04B03', pricer: '0x5362454e5648C6Ac7F03969E8a62CFc61F99b9D6', assetCoingeckoId: 'usd-coin', shareDecimals: 6, performanceFeeRate: 0.10 }, // masterUSD
  { address: '0x949a7250Bb55Eb79BC6bCC97fCd1C473DB3e6F29', pricer: '0x5100Aee934F0EE05FA78B03114a068Da18aFEd8D', assetCoingeckoId: 'usd-coin', shareDecimals: 18, performanceFeeRate: 0.20 }, // dnHYPE
  { address: '0x8858a307a85982c2b3cb2ace1720237f2f09c39b', pricer: '0x58F6138DB540D0f5bfB24Fd9b17db54694a92ea6', assetCoingeckoId: 'usd-coin', shareDecimals: 18, performanceFeeRate: 0.15 }, // dnPUMP
  { address: '0x6EB6724D8D3D4FF9E24d872E8c38403169dC05f8', pricer: '0x988E3E2C26840F2cAe2c5fB55fAeb5e59CE1A597', assetCoingeckoId: 'tether-gold-tokens', shareDecimals: 18, performanceFeeRate: 0.10 }, // hbXAUt
]

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
];

const getTotalSupply = async (options: FetchOptions, target: string) => {
  return await options.api.call({
    target: target,
    abi: "function totalSupply() external view returns (uint256)",
    permitFailure: true,
  });
};

const getExchangeRateBeforeAfterVaults = async (options: FetchOptions, target: string, abi: string) => {
  const [exchangeRateBefore, exchangeRateAfter] = await Promise.all([
    options.fromApi.call({ target: target, abi: abi, params: [], permitFailure: true }),
    options.toApi.call({ target: target, abi: abi, params: [], permitFailure: true }),
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
  const { dailyFees: morphoDailyFees, dailyRevenue: morphoDailyRevenue, dailySupplySideRevenue: morphoDailySupplySideRevenue } = await (curatorAdapter.adapter as any)[options.chain].fetch(options);

  const dailyFees = options.createBalances()
  const dailyRevenue = options.createBalances()
  const dailySupplySideRevenue = options.createBalances()

  dailyFees.addCGToken('usd-coin', await morphoDailyFees.getUSDValue())
  dailyRevenue.addCGToken('usd-coin', await morphoDailyRevenue.getUSDValue())
  dailySupplySideRevenue.addCGToken('usd-coin', await morphoDailySupplySideRevenue.getUSDValue())

  // Price-feed based vaults (no getRate pricer)
  for (const vault of StandaloneVaults) {
    const totalAssets = await getTotalSupply(options, vault.address);
    const [exchangeRateBefore, exchangeRateAfter] = await getExchangeRateBeforeAfterVaults(options, vault.priceFeed, vault.priceFeedAbi);

    if (totalAssets && exchangeRateBefore && exchangeRateAfter) {
      const growthRate = (exchangeRateAfter - exchangeRateBefore) / 1e8

      if (growthRate > 0) {
        const supplySideRevenue = (totalAssets / 1e18) * growthRate;
        const protocolRevenue = (supplySideRevenue / (1 - vault.performanceFeeRate)) - supplySideRevenue;

        dailyFees.addCGToken(vault.assetCoingeckoId, supplySideRevenue + protocolRevenue);
        dailySupplySideRevenue.addCGToken(vault.assetCoingeckoId, supplySideRevenue);
        dailyRevenue.addCGToken(vault.assetCoingeckoId, protocolRevenue);
      }
    }
  }

  // getRate() based vaults: yield = totalSupply * (getRate growth), denominated in the base asset.
  for (const vault of getRateVaults) {
    const totalSupply = await getTotalSupply(options, vault.address);
    const [rateBefore, rateAfter] = await getExchangeRateBeforeAfterVaults(options, vault.pricer, getRateAbi);

    if (totalSupply && rateBefore && rateAfter) {
      const growthRate = (rateAfter - rateBefore) / 1e8 // change in base-asset (human) per share

      if (growthRate > 0) {
        const shares = totalSupply / 10 ** vault.shareDecimals;
        const supplySideRevenue = shares * growthRate; // base-asset, human units
        const protocolRevenue = (supplySideRevenue / (1 - vault.performanceFeeRate)) - supplySideRevenue;

        dailyFees.addCGToken(vault.assetCoingeckoId, supplySideRevenue + protocolRevenue);
        dailySupplySideRevenue.addCGToken(vault.assetCoingeckoId, supplySideRevenue);
        dailyRevenue.addCGToken(vault.assetCoingeckoId, protocolRevenue);
      }
    }
  }

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
};

const adapter: Adapter = {
  version: 2,
  methodology: {
    Fees: "Yield generated by Hyperbeat Earn vaults (Liquid/Morpho/getRate vaults, excluding beHYPE).",
    Revenue: "Performance-fee share of vault yield kept by Hyperbeat.",
    ProtocolRevenue: "Performance-fee share of vault yield kept by Hyperbeat.",
    SupplySideRevenue: "Vault yield distributed to depositors.",
  },
  fetch,
  chains: [CHAIN.HYPERLIQUID],
  start: '2025-06-01',
};

export default adapter;
