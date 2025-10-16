import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
const sdk = require('@defillama/sdk')
import { METRIC } from "../../helpers/metrics";

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
const beHYPE = "0xd8FC8F0b03eBA61F64D08B0bef69d80916E5DdA9"
const beHYPE_STAKING_CORE = "0xCeaD893b162D38e714D82d06a7fe0b0dc3c38E0b"
const hbUSDC = "0x057ced81348D57Aad579A672d521d7b4396E8a61"
const hbUSDC_PRICE_AGGREGATOR = "0xc82CAd78983436BddfcAf0F21316207D87b87462"





// Morpho Vault curator addresses for Hyperbeat
const MORPHO_VAULT_CURATORS = [
    "0xe3ea927a0f41B4a84fA9900812E52F8BcB84f396", // Gauntlet
    "0xb830B8B1A41c38603dBC6E4b562Ff599eDB415C4", // MEV Capital
    "0xA4362C5F624F8f50DB23E9FE99FDEC2627cB36Fd", // Relend Network
    "0x75178137D3B4B9A0F771E0e149b00fB8167BA325", // Hyperithm
    "0x036845F9BE6DF938Da01Abe33e056D3CcaA836a2", // Re7 Labs
    "0x6293e97900aA987Cf3Cbd419e0D5Ba43ebfA91c1", // MEV Capital (additional)
];
const getTotalSupply = async (options, target) => {
    return await options.api.call({
        target: target,
        abi: "function totalSupply() external view returns (uint256)",
    });
};



const exchangeRateMidasAbi = "function lastAnswer() external view returns (int256)";
const exchangeRateUpshiftAbi = "function latestAnswer() external view returns (int256)";
const exchangeRatioStakingCoreAbi = "function exchangeRatio() external view returns (uint256)";

const getExchangeRateBeforeAfterVaults = async (options, target, abi) => {
    const [exchangeRateBefore, exchangeRateAfter] = await Promise.all([
        options.fromApi.call({
            target: target,
            abi: abi,
            params: [],
        }),
        options.toApi.call({
            target: target,
            abi: abi,
            params: [],
        })])

    return [exchangeRateBefore, exchangeRateAfter]

}


const fetch = async (options: FetchOptions) => {
    const dailyFees = options.createBalances();


    // liquidHYPE vault
    const totalSupply_liquidhype = await getTotalSupply(options, LIQUIDHYPE);
    const [exchangeRateBeforeLIQUIDHYPE, exchangeRateAfterLIQUIDHYPE] = await getExchangeRateBeforeAfterVaults(options, LIQUIDHYPE_PRICE_AGGREGATOR, exchangeRateMidasAbi);
    dailyFees.addCGToken('hyperliquid', (totalSupply_liquidhype / 1e18) * (exchangeRateAfterLIQUIDHYPE / 1e8 - exchangeRateBeforeLIQUIDHYPE / 1e8));
    // // hbusdt vault
    const totalSupply_hbusdt = await getTotalSupply(options, HBUSDT);
    const [exchangeRateBeforeHBUSDT, exchangeRateAfterHBUSDT] = await getExchangeRateBeforeAfterVaults(options, HBUSDT_PRICE_AGGREGATOR, exchangeRateMidasAbi);
    dailyFees.addCGToken('usdt0', (totalSupply_hbusdt / 1e18) * (exchangeRateAfterHBUSDT / 1e8 - exchangeRateBeforeHBUSDT / 1e8));
    // // hbxaut vault
    const totalSupply_hbxaut = await getTotalSupply(options, HBXAUT);
    const [exchangeRateBeforeHBXAUT, exchangeRateAfterHBXAUT] = await getExchangeRateBeforeAfterVaults(options, HBXAUT_PRICE_AGGREGATOR, exchangeRateMidasAbi);
    dailyFees.addCGToken('xaut', (totalSupply_hbxaut / 1e18) * (exchangeRateAfterHBXAUT / 1e8 - exchangeRateBeforeHBXAUT / 1e8));
    // //hblsthype vault
    const totalSupply_hblsthype = await getTotalSupply(options, HBLSTHYPE);
    const [exchangeRateBeforeHBLSTHYPE, exchangeRateAfterHBLSTHYPE] = await getExchangeRateBeforeAfterVaults(options, HBLSTHYPE_PRICE_AGGREGATOR, exchangeRateMidasAbi);
    dailyFees.addCGToken('kinetic-staked-hype', (totalSupply_hblsthype / 1e18) * (exchangeRateAfterHBLSTHYPE / 1e8 - exchangeRateBeforeHBLSTHYPE / 1e8));
    // //hbhype vault
    const totalSupply_hbhype = await getTotalSupply(options, HBHYPE);
    const [exchangeRateBeforeHBHYPE, exchangeRateAfterHBHYPE] = await getExchangeRateBeforeAfterVaults(options, HBHYPE_PRICE_AGGREGATOR, exchangeRateUpshiftAbi);
    dailyFees.addCGToken('hyperliquid', (totalSupply_hbhype / 1e18) * (exchangeRateAfterHBHYPE / 1e8 - exchangeRateBeforeHBHYPE / 1e8));
    // // hbbtc vault
    const totalSupply_hbbtc = await getTotalSupply(options, hbBTC);
    const [exchangeRateBeforeHBTC, exchangeRateAfterHBTC] = await getExchangeRateBeforeAfterVaults(options, hbBTC_PRICE_AGGREGATOR, exchangeRateUpshiftAbi);
    dailyFees.addCGToken('unit-bitcoin', (totalSupply_hbbtc / 1e18) * (exchangeRateAfterHBTC / 1e8 - exchangeRateBeforeHBTC / 1e8));
    // // dnPUMP vault (Midas)
    const totalSupply_dnpump = await getTotalSupply(options, dnPUMP);
    const [exchangeRateBeforeDNPUMP, exchangeRateAfterDNPUMP] = await getExchangeRateBeforeAfterVaults(options, dnPUMP_PRICE_AGGREGATOR, exchangeRateMidasAbi);
    dailyFees.addCGToken('usd-coin', (totalSupply_dnpump / 1e18) * (exchangeRateAfterDNPUMP / 1e8 - exchangeRateBeforeDNPUMP / 1e8));
    // // dnHYPE vault (Midas)
    const totalSupply_dnhype = await getTotalSupply(options, dnHYPE);
    const [exchangeRateBeforeDNHYPE, exchangeRateAfterDNHYPE] = await getExchangeRateBeforeAfterVaults(options, dnHYPE_PRICE_AGGREGATOR, exchangeRateMidasAbi);
    dailyFees.addCGToken('usd-coin', (totalSupply_dnhype / 1e18) * (exchangeRateAfterDNHYPE / 1e8 - exchangeRateBeforeDNHYPE / 1e8));
    // // wVLP vault (Midas)
    const totalSupply_wvlp = await getTotalSupply(options, wVLP);
    const [exchangeRateBeforeWVLP, exchangeRateAfterWVLP] = await getExchangeRateBeforeAfterVaults(options, wVLP_PRICE_AGGREGATOR, exchangeRateMidasAbi);
    dailyFees.addCGToken('usd-coin', (totalSupply_wvlp / 1e18) * (exchangeRateAfterWVLP / 1e8 - exchangeRateBeforeWVLP / 1e8));
    // // beHYPE LST vault (StakingCore)
    const totalSupply_behype = await getTotalSupply(options, beHYPE);
    const [exchangeRatioBeforeBEHYPE, exchangeRatioAfterBEHYPE] = await getExchangeRateBeforeAfterVaults(options, beHYPE_STAKING_CORE, exchangeRatioStakingCoreAbi);
    dailyFees.addCGToken('hyperliquid', (totalSupply_behype / 1e18) * (exchangeRatioAfterBEHYPE / 1e18 - exchangeRatioBeforeBEHYPE / 1e18));
    // // hbUSDC vault (Midas)
    const totalSupply_hbusdc = await getTotalSupply(options, hbUSDC);
    const [exchangeRateBeforeHBUSDC, exchangeRateAfterHBUSDC] = await getExchangeRateBeforeAfterVaults(options, hbUSDC_PRICE_AGGREGATOR, exchangeRateMidasAbi);
    dailyFees.addCGToken('usd-coin', (totalSupply_hbusdc / 1e18) * (exchangeRateAfterHBUSDC / 1e8 - exchangeRateBeforeHBUSDC / 1e8));

    return {
        dailyFees,
    };
};

const adapter: Adapter = {
    version: 2,
    adapter: {
        [CHAIN.HYPERLIQUID]: {
            fetch,
            meta: {
                methodology: {
                    Fees: "Fees generated by vaults",
                    Revenue: "Staking/Restaking rewards + Fees on Liquid Vaults",
                },
                morphoVaultOwners: MORPHO_VAULT_CURATORS,
            },
            start: '2025-05-01',
        },
    },
};

export default adapter;