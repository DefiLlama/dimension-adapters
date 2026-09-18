import { ChainApi } from "@defillama/sdk";
import { CHAIN } from "../../helpers/chains";

/** Concrete's public vault registry: the only thing this adapter reads off-chain. */
export const CONCRETE_API = "https://apy.api.concrete.xyz/v1";

/** Vaults whose all-time peak TVL never exceeded this are test deployments and dust (Concrete's own reporting cut-off). */
export const MIN_PEAK_TVL_USD = 1_000;

/** Chains with tracked vaults. `start` is the deployment day of the chain's first tracked vault. */
export const CHAIN_CONFIG: Record<string, { chainId: number; start: string }> = {
  [CHAIN.ETHEREUM]: { chainId: 1, start: '2024-11-25' },
  [CHAIN.MORPH]: { chainId: 2818, start: '2025-01-28' },
  [CHAIN.BERACHAIN]: { chainId: 80094, start: '2025-01-30' },
  [CHAIN.KATANA]: { chainId: 747474, start: '2025-07-29' },
  [CHAIN.ARBITRUM]: { chainId: 42161, start: '2025-08-15' },
  [CHAIN.STABLE]: { chainId: 988, start: '2025-11-19' },
};

export type VaultOverride = {
  /**
   * Operator wallets whose share mints and burns are bookkeeping rather than deposits and
   * redemptions: a campaign re-issuing migrated positions one share per token, a make-whole
   * top-up. They move the share price without moving assets, so their rate step is not yield.
   */
  admins?: string[];
  /**
   * When the vault's assets left its accounting for good (migrated to another chain or vault).
   * Whatever the contracts report afterwards is not depositor yield.
   */
  valuelessSince?: string;
};

/** Keyed by `${chain}:${vault}` (lowercase). Source: Concrete's earn-apy vault configuration. */
export const VAULT_OVERRIDES: Record<string, VaultOverride> = {
  // Berachain campaign, mainnet side: positions migrated to Berachain on 2025-05-06.
  [`${CHAIN.ETHEREUM}:0x34bdba9b3d8e3073eb4470cd4c031c2e39c32da8`]: { valuelessSince: '2025-05-06T12:00:00Z' }, // ctLBTC
  [`${CHAIN.ETHEREUM}:0x52c2bc859f5082c4f8c17266a3cd640b5047370e`]: { valuelessSince: '2025-05-06T12:00:00Z' }, // ctWBTC
  [`${CHAIN.ETHEREUM}:0x9dc37e4a901b1e21bd05e75c3b9a633a17001a39`]: { valuelessSince: '2025-05-06T12:00:00Z' }, // ctUSDe
  [`${CHAIN.ETHEREUM}:0xf80c6636f9597d6a7fc1e5182b168b71e98fd1cb`]: { valuelessSince: '2025-05-06T12:00:00Z' }, // ctsUSDe
  [`${CHAIN.ETHEREUM}:0x61e2de83bbab5a7a5bb2c5d40a5f737135eeaa13`]: { valuelessSince: '2025-05-06T12:00:00Z' }, // ctberaEth
  // Movement campaign: positions moved to the Movement network on 2025-04-14.
  [`${CHAIN.ETHEREUM}:0x3334fd638c814f0e88e843079d4d4b1e0a766c84`]: { valuelessSince: '2025-04-14T12:00:00Z' }, // ctMoveLBTC-11.5%
  [`${CHAIN.ETHEREUM}:0x7ec9ce669c6291de3be12c60e1b491deca7a238e`]: { valuelessSince: '2025-04-14T12:00:00Z' }, // ctMoveWBTC-11.5%-50
  [`${CHAIN.ETHEREUM}:0x0a807c39f3d3baa9780a2bf8649ff1da6cdf5b4b`]: { valuelessSince: '2025-04-14T12:00:00Z' }, // ctMoveLBTC-5.5%
  [`${CHAIN.ETHEREUM}:0x4cb213dafa6145cfc78b83cbe328e654bac681d6`]: { valuelessSince: '2025-04-14T12:00:00Z' }, // ctMovestBTC-11.5%
  [`${CHAIN.ETHEREUM}:0xdb5942f0c40e8f700de6a664dd5d58073a7b70a6`]: { valuelessSince: '2025-04-14T12:00:00Z' }, // ctMovestBTC-7%
  [`${CHAIN.ETHEREUM}:0x5224081801abaab688967ce6bb4937cab6b6bcbc`]: { valuelessSince: '2025-04-14T12:00:00Z' }, // ctMoveWETH-20%
  [`${CHAIN.ETHEREUM}:0x78c87aeaeb1773467683bbb517f00d62553471ec`]: { valuelessSince: '2025-04-14T12:00:00Z' }, // ctMoveezETH-20%
  [`${CHAIN.ETHEREUM}:0x7c8a4e0ea7030034fa8490b25e1f966a64e68ae4`]: { valuelessSince: '2025-04-14T12:00:00Z' }, // ctMoveezETH-10%
  [`${CHAIN.ETHEREUM}:0x50307a99cb7250f6b5c717366189d896e09fae32`]: { valuelessSince: '2025-04-14T12:00:00Z' }, // ctMoveWETH-14%
  [`${CHAIN.ETHEREUM}:0x1972839251f75c5829420a1bc259aa932fefebe0`]: { valuelessSince: '2025-04-14T12:00:00Z' }, // ctMoveUSDe-20%
  [`${CHAIN.ETHEREUM}:0x859bbfd9e28b2fb1da75241096dcaf73e07a70a7`]: { valuelessSince: '2025-04-14T12:00:00Z' }, // ctMovesUSDe-20%
  [`${CHAIN.ETHEREUM}:0x17438b7fe6c363ed361a804c7406bee37db8bbfc`]: { valuelessSince: '2025-04-14T12:00:00Z' }, // ctMoveUSDC-13%
  [`${CHAIN.ETHEREUM}:0x86dd4516a575a1dd852467acb2cdca1d00f57760`]: { valuelessSince: '2025-04-14T12:00:00Z' }, // ctMoveUSDT-13%
  [`${CHAIN.ETHEREUM}:0xe98a6ffbc2b6632b410128c15a23b114297dba5d`]: { valuelessSince: '2025-04-14T12:00:00Z' }, // ctMoveUSDC-20%
  [`${CHAIN.ETHEREUM}:0x124313cf1771b3080849aa43fe113596a94125b6`]: { valuelessSince: '2025-04-14T12:00:00Z' }, // ctWBTC-11.5%-25
  [`${CHAIN.ETHEREUM}:0x50062d850e921dd55cdd8c607ba33ba3377631aa`]: { valuelessSince: '2025-04-14T12:00:00Z' }, // ctSolvBTC-7%-40
  [`${CHAIN.ETHEREUM}:0xd0f744c96e7d84e61f0fa0506a89ad6625e51aa0`]: { valuelessSince: '2025-04-14T12:00:00Z' }, // ctSolvBTC-11.5%-25
  [`${CHAIN.ETHEREUM}:0x4f4f221ff09b01dfd2ef2206da581262b04b9858`]: { valuelessSince: '2025-04-14T12:00:00Z' }, // ctMoveWETH-20%-Kelp
  [`${CHAIN.ETHEREUM}:0x9694ab1b52e51e56390ec5fd3e6f78daae97c312`]: { valuelessSince: '2025-04-14T12:00:00Z' }, // ctMoversETH-20%-Kelp
  [`${CHAIN.ETHEREUM}:0x789225832e55961fa6b805e1a31a15e2d262647f`]: { valuelessSince: '2025-04-14T12:00:00Z' }, // ctMovesfrxUSD-15%
  // Corn campaign: positions moved to Corn on 2025-05-26.
  [`${CHAIN.ETHEREUM}:0x6efc9e023ba7f64ef8431b671b15f1d32439f0ae`]: { valuelessSince: '2025-05-26T11:00:00Z' }, // ctCornLBTC
  [`${CHAIN.ETHEREUM}:0x5a35b8817cb92dcd7196b243351f018c4982c010`]: { valuelessSince: '2025-05-26T11:00:00Z' }, // ctCornsolvBTC.BBN
  [`${CHAIN.ETHEREUM}:0xb1cdf3c96000330f018b7d7df5bee5e7f9e13b62`]: { valuelessSince: '2025-05-26T11:00:00Z' }, // ctCornuniBTC
  [`${CHAIN.ETHEREUM}:0x3eb6464a77d7b619aaafa7e9ffc0fbe3ed7084b3`]: { valuelessSince: '2025-05-26T11:00:00Z' }, // ctCornUSDT
  // Stable pre-deposit vaults: assets bridged to Stable on 2025-12-04; the Stable vaults issue the
  // migrated shares through their operator.
  [`${CHAIN.ETHEREUM}:0x6503de9fe77d256d9d823f2d335ce83ece9e153f`]: { valuelessSince: '2025-12-04T12:43:55Z' }, // ctStableUSDT
  [`${CHAIN.ETHEREUM}:0x4def5abcfba7babe04472ee4835f459daf4bd45f`]: { valuelessSince: '2025-12-04T13:36:58Z' }, // ctStablefrxUSD
  [`${CHAIN.STABLE}:0x607e8c274e5e7934e4062e816891228d6fd23740`]: { admins: ['0x8dfb636d389e5dce8d52ded02627fc96cd3da2fb'] }, // ctStableUSDT
  [`${CHAIN.STABLE}:0x8650e04a882c78e9ebc74be501fc0312c526d0db`]: { admins: ['0x27c7099bd48e0813c0ea3b8a855d2c204b5e8aeb'] }, // ctStablefrxUSD
  // V1 -> V2 migration of ctWBTC on 2026-03-20: the V2 vault issued the migrated shares through its operator.
  [`${CHAIN.ETHEREUM}:0xacce65b9db4810125addea9797baaaaad2b73788`]: { valuelessSince: '2026-03-20T15:33:23Z' }, // ctWBTC V1
  [`${CHAIN.ETHEREUM}:0xf72bd5a56de97840f1fdd3641b556126c10aa1c4`]: { admins: ['0x638c24c17c7a18fd2479ba18667f4e6577e0ffcc'] }, // ctWBTC V2
  [`${CHAIN.ETHEREUM}:0xe72d4cc29285e33a1bd3f2a5e433256378ebfb88`]: { admins: ['0x771f7cd2ab5e146574b3a81c30d79c4f36f652b2'] }, // ctFrontierUSDC
  // USD.ai vaults wound down on 2025-11-19.
  [`${CHAIN.ARBITRUM}:0x62ddf301b21970e7cc12c34caac9ce9bc975c0a9`]: { valuelessSince: '2025-11-19T00:00:00Z' }, // autoUSDai
  [`${CHAIN.ARBITRUM}:0xe2d8267d285a7ae1edf48498ff044241d04e9608`]: { valuelessSince: '2025-11-19T00:00:00Z' }, // autoSUSDai
  // Berachain campaign vaults: migrated positions were re-issued one share per token by the
  // campaign's operators (2025-05-06/09), and several vaults later migrated again (2025-07-16, 2025-10-02).
  [`${CHAIN.BERACHAIN}:0xf0d94806e6e5cb54336ed0f8de459659718f149c`]: { // ctLBTC
    admins: ['0x7d5154f3d7ad0a610b11ab0a7c9414bc11e8cc24', '0x5791ad4f227eeebffba81037ab287c008a714f72'],
    valuelessSince: '2025-07-16T10:11:46Z',
  },
  [`${CHAIN.BERACHAIN}:0xaebecae444ac70aba0385fec4cb11eb26a12c92b`]: { // ctWBTC
    admins: ['0xf801ca0a6ec7d75577799c78c1f96dddfdb6375d', '0xe7f8aace18cb4a831d4dffc08ecb3bdf6c35ef69'],
    valuelessSince: '2025-07-16T10:11:46Z',
  },
  [`${CHAIN.BERACHAIN}:0x59e24f42cae1b82c8b2dc79ea898f2f8b4986dfc`]: { // ctUSDe
    admins: ['0x1a6945f6ab444394d07c98643c1a669d69f4816e', '0xdf5e736758d9fa1dd0fcbe5dfdc5d2dae1a5dcb0', '0x800123cac8afd425270d4ce52f6d404e476dce6e'],
    valuelessSince: '2025-07-16T10:11:46Z',
  },
  [`${CHAIN.BERACHAIN}:0xda785861aa6fd80d1388f65693cd62d8a1e2956a`]: { // ctsUSDe
    admins: ['0xbbc600f43fd37812954b6eb33f3b6c6f1a5f13bd', '0xe254b56e24e8939fd513e2cdb060dec96d9ee26d'],
    valuelessSince: '2025-07-16T10:11:46Z',
  },
  [`${CHAIN.BERACHAIN}:0x179b6b2a213c0bb79073f0a9b90daf42c41c6883`]: { // ctBeraEth
    admins: ['0x3451e9e21dc9705ccaeb0e61971862897818be23', '0x800123cac8afd425270d4ce52f6d404e476dce6e'],
    valuelessSince: '2025-07-16T10:11:46Z',
  },
  [`${CHAIN.BERACHAIN}:0xb6e3c1154e07f8a3dc04a9a28648c7aa30511120`]: { // ctBeraLBTC
    admins: ['0x6877f7217b61cde9265a90175092878dd7cc5017', '0x5791ad4f227eeebffba81037ab287c008a714f72', '0x800123cac8afd425270d4ce52f6d404e476dce6e'],
    valuelessSince: '2025-10-02T14:35:51Z',
  },
  [`${CHAIN.BERACHAIN}:0x335e7b56054f830883d1509afdce58dedcefb29c`]: { // ctBeraWBTC
    admins: ['0xe7f8aace18cb4a831d4dffc08ecb3bdf6c35ef69', '0xd82faaed84b5ac7ce66f31e96f935c1324762649', '0x7217ad65f90bf26e7f80a6e8c0b59dd7fe056ef4', '0x800123cac8afd425270d4ce52f6d404e476dce6e'],
    valuelessSince: '2025-10-02T14:35:51Z',
  },
  [`${CHAIN.BERACHAIN}:0x585934afbf1fa9f563b80283f8b916dd8f66a9b6`]: { admins: ['0x1a6945f6ab444394d07c98643c1a669d69f4816e', '0x195108ba9f150d35fc41bc127bd59accb59c0139'] }, // ctBeraUSDe
  [`${CHAIN.BERACHAIN}:0x49bee393825bbac404fefe6e24f34854f30905d2`]: { admins: ['0xbfedeac38203e68f1f2a41f27cac5469f426c540', '0x3451e9e21dc9705ccaeb0e61971862897818be23'] }, // ctBeraETH
  [`${CHAIN.BERACHAIN}:0xd08e3652e6b29ebdd58fe93b422513862fb49899`]: { admins: ['0x800123cac8afd425270d4ce52f6d404e476dce6e', '0xd82faaed84b5ac7ce66f31e96f935c1324762649', '0xe254b56e24e8939fd513e2cdb060dec96d9ee26d'] }, // ctBerasUSDe
};

/**
 * How an underlying asset converts to the token its vaults' yield is priced in: an on-chain
 * amount-to-amount conversion (`read(api, amounts)` returns base raw units for each of the asset
 * raw amounts, in one batched call), so no rate scale or decimals are assumed. Bridged tokens have
 * no local source and read their home-chain one at the same instant.
 */
export type RateSource = { base: string; chain: string; read: (api: ChainApi, amounts: bigint[]) => Promise<bigint[]> };

const convert = (chain: string, base: string, target: string, abi: string): RateSource => ({
  base, chain,
  read: async (api, amounts) => (await api.multiCall({ abi, calls: amounts.map((amount) => ({ target, params: [amount.toString()] })) })).map(BigInt),
});
const erc4626 = (chain: string, base: string, target: string) =>
  convert(chain, base, target, 'function convertToAssets(uint256 shares) view returns (uint256)');

// Base tokens, on mainnet so every chain prices the same token (canonical mainnet contracts).
const WETH = 'ethereum:0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2';
const STETH = 'ethereum:0xae7ab96520de3a18e5e111b5eaab095312d7fe84'; // Lido stETH
const USDC = 'ethereum:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';
const USDE = 'ethereum:0x4c9edd5852cd905f086c759e8383e09bff1e68b3'; // Ethena USDe
const FRXUSD = 'ethereum:0xcacd6fd266af91b8aed52accc382b4e165586e29'; // Frax frxUSD

// Rate sources: the token contracts themselves unless noted (all verified on their chain's explorer).
const WSTETH = '0x7f39c581f595b53c5cb19bd0b3f8da6c935e2ca0'; // Lido wstETH
const SUSDE = '0x9d39a5de30e57443bff2a8307a4256c8797a3497'; // Ethena sUSDe (ERC-4626)
const SFRXUSD = '0xcf62f905562626cfcdd2261162a51fd02fc9c5b6'; // Frax sfrxUSD (ERC-4626)
const WEETH = '0xcd5fe23c85820f7b72d0926fc9b05b43e359b7ee'; // ether.fi weETH
const EZETH = '0xbf5495efe5db9ce00f80364c8b423567e58d2110'; // Renzo ezETH
const BERAETH = '0x6fc6545d5cde268d5c7f1e476d444f39c995120d'; // Dinero beraETH, Berachain
const SYRUP_USDC = '0x80ac24aa929eaf5013f6436cda2a7ba190f5cc0b'; // Maple syrupUSDC pool token (ERC-4626); the Arbitrum token is its bridge
const THBILL = '0x5fa487bca6158c64046b2813623e20755091da0b'; // Theo thBILL fund token (ERC-4626); the Arbitrum and Stable tokens are its bridges
const RENZO_RESTAKE_MANAGER = '0x74a09653a083691711cf8215a6ab074bb4e99ef5'; // Renzo RestakeManager (calculateTVLs)
const KELP_DEPOSIT_POOL = '0x036676389e48133b63a802f8635ad39e752d375d'; // KelpDAO LRTDepositPool (getRsETHAmountToMint)
const NATIVE_ETH = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'; // Kelp's placeholder for native ETH

const wstEth = convert(CHAIN.ETHEREUM, STETH, WSTETH, 'function getStETHByWstETH(uint256 wstETHAmount) view returns (uint256)');
const weEth = convert(CHAIN.ETHEREUM, WETH, WEETH, 'function getEETHByWeETH(uint256 weETHAmount) view returns (uint256)');
const beraEth = convert(CHAIN.BERACHAIN, WETH, BERAETH, 'function getLSTAmount(uint256 amount) view returns (uint256)');
const sUsde = erc4626(CHAIN.ETHEREUM, USDE, SUSDE);
const sfrxUsd = erc4626(CHAIN.ETHEREUM, FRXUSD, SFRXUSD);
const syrupUsdc = erc4626(CHAIN.ETHEREUM, USDC, SYRUP_USDC);
const thBill = erc4626(CHAIN.ETHEREUM, USDC, THBILL);
// ezETH has no conversion function: ETH per ezETH is Renzo's total TVL over the ezETH supply.
const ezEth: RateSource = {
  base: WETH, chain: CHAIN.ETHEREUM,
  read: async (api, amounts) => {
    const tvls = await api.call({ target: RENZO_RESTAKE_MANAGER, abi: 'function calculateTVLs() view returns (uint256[][], uint256[], uint256)' });
    const supply = BigInt(await api.call({ target: EZETH, abi: 'uint256:totalSupply' }));
    // No supply means no valuation; a zero reads as an unvalued point and the segment is skipped.
    return amounts.map((amount) => (supply === 0n ? 0n : (amount * BigInt(tvls[2])) / supply));
  },
};
// rsETH exposes the opposite direction (rsETH minted per ETH deposited); invert it.
const rsEth: RateSource = {
  base: WETH, chain: CHAIN.ETHEREUM,
  read: async (api, amounts) => {
    const minted: string[] = await api.multiCall({
      abi: 'function getRsETHAmountToMint(address asset, uint256 amount) view returns (uint256)',
      calls: amounts.map((amount) => ({ target: KELP_DEPOSIT_POOL, params: [NATIVE_ETH, amount.toString()] })),
    });
    // A zero quote means no valuation; it reads as an unvalued point and the segment is skipped.
    return amounts.map((amount, i) => (BigInt(minted[i]) === 0n ? 0n : (amount * amount) / BigInt(minted[i])));
  },
};

/** Keyed by `${chain}:${asset}` (lowercase); the asset addresses are the vaults' `asset()`. Assets not listed here are priced as themselves. */
export const UNDERLYING_ASSET_CONVERSIONS: Record<string, RateSource> = {
  [`${CHAIN.ETHEREUM}:${WSTETH}`]: wstEth,
  [`${CHAIN.ETHEREUM}:${SUSDE}`]: sUsde,
  [`${CHAIN.ETHEREUM}:${SFRXUSD}`]: sfrxUsd,
  [`${CHAIN.ETHEREUM}:${WEETH}`]: weEth,
  [`${CHAIN.ETHEREUM}:${EZETH}`]: ezEth,
  [`${CHAIN.ETHEREUM}:0xa1290d69c65a6fe4df752f95823fae25cb99e5a7`]: rsEth,
  [`${CHAIN.ARBITRUM}:0x2416092f143378750bb29b79ed961ab195cceea5`]: ezEth, // bridged ezETH
  [`${CHAIN.ARBITRUM}:0x41ca7586cc1311807b4605fbb748a3b8862b42b5`]: syrupUsdc, // bridged syrupUSDC
  [`${CHAIN.ARBITRUM}:0xfdd22ce6d1f66bc0ec89b20bf16ccb6670f55a5a`]: thBill, // bridged thBILL
  [`${CHAIN.STABLE}:0xfdd22ce6d1f66bc0ec89b20bf16ccb6670f55a5a`]: thBill, // bridged thBILL
  [`${CHAIN.BERACHAIN}:0x211cc4dd073734da055fbf44a2b4667d5e5fe5d2`]: sUsde, // bridged sUSDe
  [`${CHAIN.BERACHAIN}:${BERAETH}`]: beraEth,
  [`${CHAIN.MORPH}:0x7dcc39b4d1c53cb31e1abc0e358b43987fef80f7`]: weEth, // bridged weETH
};

/**
 * Staking rewards campaigns paid to vault depositors by partners, booked on their distribution day
 * at the token's price that day. Amounts are in whole tokens; token addresses are the reward
 * tokens on the chain they were paid on. Source: Concrete's earn-apy configuration (`config/rewards/`).
 */
export type StakingRewardsCampaign = { name: string; chain: string; token: string; amount: string; distributedOn: string };

export const STAKING_REWARDS_CAMPAIGNS: StakingRewardsCampaign[] = [
  { name: 'Beraborrow POLLEN', chain: CHAIN.BERACHAIN, token: '0xc99e948e9d183848a6c4f5e6c1d225f02f171d79', amount: '409607.63', distributedOn: '2025-05-06' },
  { name: 'Berachain WBERA', chain: CHAIN.BERACHAIN, token: '0x6969696969696969696969696969696969696969', amount: '1364059.29', distributedOn: '2025-05-06' },
  // Vested linearly 2025-04-25..2025-05-25 and claimed on the Movement network; booked at the vest end.
  { name: 'Movement MOVE', chain: CHAIN.ETHEREUM, token: '0x3073f7aaa4db83f95e9fff17424f71d4751a3073', amount: '1198326.93111388', distributedOn: '2025-05-25' },
  { name: 'Movement MOVE (boosted)', chain: CHAIN.ETHEREUM, token: '0x3073f7aaa4db83f95e9fff17424f71d4751a3073', amount: '4888252.50026939', distributedOn: '2025-05-25' },
  { name: 'Corn CORN', chain: CHAIN.ETHEREUM, token: '0x44f49ff0da2498bcb1d3dc7c0f999578f67fd8c6', amount: '4200000', distributedOn: '2025-05-30' },
  { name: 'USD.ai Arbitrum grant 1', chain: CHAIN.ARBITRUM, token: '0xaf88d065e77c8cc2239327c5edb3a432268e5831', amount: '250000', distributedOn: '2025-10-01' },
  { name: 'USD.ai Arbitrum grant 2', chain: CHAIN.ARBITRUM, token: '0xaf88d065e77c8cc2239327c5edb3a432268e5831', amount: '250000', distributedOn: '2025-10-22' },
  { name: 'Stable USDT0', chain: CHAIN.STABLE, token: '0x779ded0c9e1022225f8e0630b35a9b54be713736', amount: '208318.893384', distributedOn: '2026-01-29' },
  { name: 'Katana KAT', chain: CHAIN.KATANA, token: '0x7f1f4b4b29f5058fa32cc7a97141b8d7e5abdc2d', amount: '178889.442203316333044002', distributedOn: '2026-03-18' },
];
