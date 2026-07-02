import { FetchOptions, FetchResult, SimpleAdapter } from '../adapters/types';
import { CHAIN } from '../helpers/chains';
import { METRIC } from '../helpers/metrics';

const RUSD          = '0x09D4214C03D01F49544C0448DBE3A27f768F2b34';
const WSRUSD        = '0xd3fD63209FA2D55B07A0f6db36C2f43900be3094';
const WSRUSD_OFT    = '0x4809010926aec940b550D34a46A52739f996D75D'; // same address on Arbitrum, SEI, Monad
const SRUSD         = '0x738d1115B90efa71AE468F1287fc864775e23a31';
const SAVING_MODULE = '0x5475611Dffb8ef4d697Ae39df9395513b6E947d7';

const WAD            = BigInt('1000000000000000000');
const PRICE_SCALE    = BigInt('100000000');
const USDC_THRESHOLD = 1_000_000_000_000n;
const SCALE_6DEC     = 1_000_000_000_000n;

// ─── Merkl reward tracking ─────────────────────────────────────────────────
const MERKL_DISTRIBUTOR_ETH = '0x3Ef3D8bA38EBe18DB133cEc108f4D14CE00Dd9Ae';
const TRANSFER_TOPIC        = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const padAddr               = (a: string) => '0x000000000000000000000000' + a.toLowerCase().slice(2);

const MERKL_RECIPIENTS_SET = new Set([
  '0x3063c5907faa10c01b242181aa689beb23d2bd65',
  '0x289c204b35859bfb924b9c0759a4fe80f610671c',
  '0x3fc7ea4cd90967e28e96a7b8b60e909f15a60dc1',
  '0x65078cfef8f7c07441661393eab6cb93b31db0dd',
  '0x99a95a9e38e927486fc878f41ff8b118eb632b10',
  '0x31eae643b679a84b37e3d0b4bd4f5da90fb04a61',
  '0x9a319b57b80c50f8b19db35d3224655f3add8e4f', // Plasma adapter wallet
]);
// Stablecoins priced at $1; 6-dec ones scaled to 18-dec rUSD via SCALE_6DEC.
const MERKL_STABLES: [string, number][] = [
  ['0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', 6],   // USDC
  ['0xdac17f958d2ee523a2206206994597c13d831ec7', 6],   // USDT
  ['0x6c3ea9036406852006290770bedfcaba0e23a0e8', 6],   // PYUSD
  ['0x8292bb45bf1ee4d140127049757c2e0ff06317ed', 18],  // RLUSD
  ['0x40d16fc0246ad3160ccc09b8d0d3a2cd28ae6c2f', 18],  // GHO
  ['0x8d0d000ee44948fc98c9b98a4fa4921476f08b0d', 18],  // USD1
];
// Market-priced tokens: added by native address so framework prices via coingecko.
const MERKL_PRICED = [
  '0x58d97b57bb95320f9a05dc918aef65434969c2b2', // MORPHO
  '0xda5e1988097297dcdc1f90d4dfe7909e847cbef6', // WLFI
];

const MERKL_STABLES_ARB: [string, number][] = [
  ['0xaf88d065e77c8cC2239327C5EDb3A432268e5831', 6],   // USDC
  ['0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9', 6],   // USDT
  ['0x7dfF72693f6A4149b17e7C6314655f6A9F7c8B33', 18],  // GHO
  ['0x8292bb45bf1ee4d140127049757c2e0ff06317ed', 18],  // RLUSD
  ['0x8d0d000ee44948fc98c9b98a4fa4921476f08b0d', 18],  // USD1
];
const MERKL_STABLES_BASE: [string, number][] = [
  ['0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', 6],   // USDC
  ['0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2', 6],   // USDT
  ['0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA', 6],   // USDbC
];
const MERKL_STABLES_OP: [string, number][] = [
  ['0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85', 6],   // USDC
  ['0x94b008aA00579c1307B0EF2c499aD98a8ce58e58', 6],   // USDT
  ['0x7F5c764cBc14f9669B88837ca1490cCa17c31607', 6],   // USDC.e
];

// ─── Uniswap V4 fee collection ────────────────────────────────────────────────
const UNI_V4_PM             = '0x000000000004444c5dc75cB358380D2e3dE08A90';
const UNI_V4_HARVEST_TOPIC  = '0xf208f4912782fd25c7f114ca3723a2d5dd6f3bcc3ac8db5af63baa85f711d5ec';
// data layout: bytes[0:32]=liquidityDelta, bytes[32:64]=fees0, bytes[64:96]=fees1

// ─── FLUID native token rewards ───────────────────────────────────────────────
const FLUID_TOKEN        = '0x6f40d4a6237c257fff2db00fa0510deeecd303eb';
const FLUID_DISTRIBUTORS = [
  '0x639f35c5e212d61fe14bd5cd8b66aae4df11a50c',
  '0x7060fe0dd3e31be01efac6b28c8d38018fd163b0',
];

// ─── Morpho Blue direct market position ──────────────────────────────────────
const MORPHO_BLUE         = '0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb';
const MONARCH_WALLET      = '0x289C204B35859bFb924B9C0759A4FE80f610671c';
const MONARCH_MARKET_IDS  = [
  '0xef2c308b5abecf5c8750a1aa82b47c558005feb7a03f4f8e1ad682d71ac8d0ba', // mF-ONE
  '0xeb17955ea422baeddbfb0b8d8c9086c5be7a9cfdefb292119a102e981a30062e', // USDC/stcUSD
  '0xbbf7ce1b40d32d3e3048f5cf27eeaa6de8cb27b80194690aab191a63381d8c99', // USDC/siUSD
  '0x802ec6e878dc9fe6905b8a0a18962dcca10440a87fa2242fbf4a0461c7b0c789', // USDC/PT-cUSD
  '0x03f715ef1ae508ab3e1faf4dffdbf2a077d1f0ad10c5aad42cf4438d5e3328af', // USDC/PT-stcUSD
  '0x79b4e55cef9e7c214b5cc965e1984229ada26a66051e35366a75c4d92b776735', // USDC/PT-srUSDe
  '0x27b9a0a5bfee98a31eb51e3850250d103a9f8e41673c782defc66aa943af0e65', // USDC/PT-srUSDe-2APR
  '0x32b4a75db50a20f7435dfdcf54593a2e96fc97901321d3ab07268941dee93edb', // USDC/PT-siUSD
];
const morphoMarketAbi    = 'function market(bytes32) view returns (uint128 totalSupplyAssets, uint128 totalSupplyShares, uint128 totalBorrowAssets, uint128 totalBorrowShares, uint128 lastUpdate, uint128 fee)';
const morphoPositionAbi  = 'function position(bytes32, address) view returns (uint256 supplyShares, uint128 borrowShares, uint128 collateral)';

const convertToAssetsAbi = 'function convertToAssets(uint256 shares) view returns (uint256)';
const balanceOfAbi       = 'function balanceOf(address) view returns (uint256)';

// ─── Ethereum ERC4626 positions ──────────────────────────────────────────────
// [vault, owner]
const VAULT_POSITIONS: [string, string][] = [
  // Cap
  ['0x88887bE419578051FF9F4eb6C858A951921D8888', '0x289C204B35859bFb924B9C0759A4FE80f610671c'], // stcUSD
  // Ethena
  ['0x9D39A5DE30e57443BfF2A8307A4256c8797A3497', '0x5563CDA70F7aA8b6C00C52CB3B9f0f45831a22b1'], // sUSDe
  // Euler
  ['0xe0a80d35bb6618cba260120b279d357978c42bce', '0x3063C5907FAa10c01B242181Aa689bEb23D2BD65'], // eUSDC-22
  ['0x797DD80692c3b2dAdabCe8e30C07fDE5307D48a9', '0x3063C5907FAa10c01B242181Aa689bEb23D2BD65'], // eUSDC-2
  ['0xba98fc35c9dfd69178ad5dce9fa29c64554783b5', '0x3063C5907FAa10c01B242181Aa689bEb23D2BD65'], // ePYUSD-6
  ['0xaF5372792a29dC6b296d6FFD4AA3386aff8f9BB2', '0x3063C5907FAa10c01B242181Aa689bEb23D2BD65'], // eRLUSD-7
  ['0x9bD52F2805c6aF014132874124686e7b248c2Cbb', '0x3063C5907FAa10c01B242181Aa689bEb23D2BD65'], // eUSDC-70
  ['0xAB2726DAf820Aa9270D14Db9B18c8d187cbF2f30', '0x3063C5907FAa10c01B242181Aa689bEb23D2BD65'], // eUSDC-80
  ['0x6DFC8ae855FA8Ab7bAbB81aB7c8a6DA7794f60fB', '0x3063C5907FAa10c01B242181Aa689bEb23D2BD65'], // erUSD-1
  // Fluid
  ['0x9Fb7b4477576Fe5B32be4C1843aFB1e55F251B33', '0x289C204B35859bFb924B9C0759A4FE80f610671c'], // fUSDC
  ['0x5C20B550819128074FD538Edf79791733ccEdd18', '0x289C204B35859bFb924B9C0759A4FE80f610671c'], // fUSDT
  ['0x6a29a46e21c730dca1d8b23d637c101cec605c5b', '0x289C204B35859bFb924B9C0759A4FE80f610671c'], // fGHO
  // InfiniFi
  ['0xDBDC1Ef57537E34680B898E1FEBD3D68c7389bCB', '0x289C204B35859bFb924B9C0759A4FE80f610671c'], // siUSD
  // Morpho
  ['0xBEeFFF209270748ddd194831b3fa287a5386f5bC', '0x841DB2cA7E8A8C2fb06128e8c58AA162de0CfCbC'], // bbqUSDC-Smokehouse
  ['0xA0804346780b4c2e3bE118ac957D1DB82F9d7484', '0xb595ba80d38b8e4c9894a6734a1b9a7b198870a2'], // bbqUSDT-Smokehouse
  ['0xbeef088055857739C12CD3765F20b7679Def0f51', '0x289C204B35859bFb924B9C0759A4FE80f610671c'], // steakUSDC Prime V2
  ['0xbeef088055857739C12CD3765F20b7679Def0f51', '0x65078cfef8f7c07441661393eab6cb93b31db0dd'], // steakUSDC Prime V2 Adapter
  ['0xdd0f28e19C1780eb6396170735D45153D261490d', '0xA100A910A30b745064d7174863B730AD6d92Fe64'], // gtUSDC-Gauntlet
  ['0xdd0f28e19C1780eb6396170735D45153D261490d', '0x289C204B35859bFb924B9C0759A4FE80f610671c'], // gtUSDC-Gauntlet-old
  ['0x8c106EEDAd96553e64287A5A6839c3Cc78afA3D0', '0x289C204B35859bFb924B9C0759A4FE80f610671c'], // gtUSDC V2
  ['0xb576765fB15505433aF24FEe2c0325895C559FB2', '0x289C204B35859bFb924B9C0759A4FE80f610671c'], // senPYUSDV2
  ['0x6dc58a0fdfc8d694e571dc59b9a52eeea780e6bf', '0x289C204B35859bFb924B9C0759A4FE80f610671c'], // senRLUSDv2
  ['0xd8A6511979D9C5D387c819E9F8ED9F3a5C6c5379', '0x289C204B35859bFb924B9C0759A4FE80f610671c'], // bbqPYUSD
  ['0x23f5E9c35820f4baB695Ac1F19c203cC3f8e1e11', '0x289C204B35859bFb924B9C0759A4FE80f610671c'], // skyUSDT-savings
  // Hyperithm
  ['0x777791C4d6DC2CE140D00D2828a7C93503c67777', '0x2adf038b67a8a29cda82f0eceb1ff0dba704b98d'], // hyperUSDC
  // IPOR
  ['0xc197ad72936b7c558c96417f22041fe9e3c7043f', '0x289C204B35859bFb924B9C0759A4FE80f610671c'], // ResHY
  // steakRUSD
  ['0xBeEf11eCb698f4B5378685C05A210bdF71093521', '0x31Eae643b679A84b37E3d0B4Bd4f5dA90fB04a61'], // steakRUSD
  // Fund wrappers — hold shares in underlying ERC4626 vaults
  ['0xBEEF01735c132Ada46AA9aA4c54623cAA92A64CB', '0x99A95a9E38e927486fC878f41Ff8b118Eb632b10'], // steakUSDC fund
  ['0xd63070114470f685b75B74D60EEc7c1113d33a3D', '0x99E8903bdEFB9e44cd6A24B7f6F97dDd071549bc'], // USUALUSDC+ fund
  ['0xbeEF346d7099865208Ff331e4f648f4154DDAa05', '0xb82749F316CB9c06F38587aBecF3EB1bC842CC93'], // bbqUSDCreservoir fund
  ['0xbeeff2C5bF38f90e3482a8b19F12E5a6D2FCa757', '0xC5deA68CCe26c014BEC516CDA70c107c534a73C4'], // bbqUSDC-HYI fund
  ['0xdd0f28e19C1780eb6396170735D45153D261490d', '0x86Ac8e29Be5ad83c611fE054Df20970d3b4f9BE0'], // gtUSDC-old2 fund
  // Additional positions
  ['0xdC035D45d973E3EC169d2276DDab16f1e407384F', '0x0b578e123e3725a15F6FCbd43ADf314EaA667c04'], // sDSR (Spark USDS)
  ['0x19ebb35279A16207Ec4ba82799CC64715065F7F6', '0x289C204B35859bFb924B9C0759A4FE80f610671c'], // Hastra PRIME
  ['0xC21b08C16458202593D4D9B26b9984Ee67b38BbD', '0x289C204B35859bFb924B9C0759A4FE80f610671c'], // Sentora PRIME
];

// ─── Ethereum rebasing (ERC20 balance-delta) positions ───────────────────────
// [token, owner, underlyingDecimals]
// Aave aTokens and other rebasing ERC20s that don't implement convertToAssets.
const REBASE_ETH_POSITIONS: [string, string, number][] = [
  ['0xFa82580c16A31D0c1bC632A36F82e83EfEF3Eec0', '0x3063C5907FAa10c01B242181Aa689bEb23D2BD65', 18], // aEthRLUSD (RLUSD=18dec)
  ['0x0C0d01AbF3e6aDfcA0989eBbA9d6e85dD58EaB1E', '0x3063C5907FAa10c01B242181Aa689bEb23D2BD65', 6],  // aEthPYUSD
  ['0x7c0477d085ECb607CF8429f3eC91Ae5E1e460F4F', '0x3063C5907FAa10c01B242181Aa689bEb23D2BD65', 6],  // aEthUSDG (USDG=6dec)
  ['0xE3190143Eb552456F88464662f0c0C4aC67A77eB', '0x3063C5907FAa10c01B242181Aa689bEb23D2BD65', 6],  // aHorRwaRLUSD
  ['0x1a88df1cfe15af22b3c4c783d4e6f7f9e0c1885d', '0x3063C5907FAa10c01B242181Aa689bEb23D2BD65', 18], // stkGHO
  ['0xA01227A26A7710bc75071286539E47AdB6DEa417', '0x8d3A354f187065e0D4cEcE0C3a5886ac4eBc4903', 18], // tUSDe
  ['0x003Ca23Fd5F0ca87D01F6eC6CD14A8AE60c2b97D', '0x289C204B35859bFb924B9C0759A4FE80f610671c', 18], // dUSD1 (Dolomite)
];

// ─── Arbitrum ERC4626 positions ───────────────────────────────────────────────
const ARB_VAULT_POSITIONS: [string, string][] = [
  ['0x5c0C306Aaa9F877de636f4d5822cA9F2E81563BA', '0x289C204B35859bFb924B9C0759A4FE80f610671c'], // bbqUSDC HY
  ['0xbeeff1D5dE8F79ff37a151681100B039661da518', '0x289C204B35859bFb924B9C0759A4FE80f610671c'], // bbqUSDC HY V2
  ['0xbeeff77CE5C059445714E6A3490E273fE7F2492F', '0x289C204B35859bFb924B9C0759A4FE80f610671c'], // bbqUSDT0 HY V2
  ['0xbeefff13dd098de415e07f033dae65205b31a894', '0x289C204B35859bFb924B9C0759A4FE80f610671c'], // ptUSDCturbo HY
  ['0x7e97fa6893871A2751B5fE961978DCCb2c201E65', '0x289C204B35859bFb924B9C0759A4FE80f610671c'], // gtUSDCc Core
  ['0x1A996cb54bb95462040408C06122D45D6Cdb6096', '0x289C204B35859bFb924B9C0759A4FE80f610671c'], // fUSDC (Fluid)
  ['0x037dff1c12805707d7c29f163e0f09fc9102657a', '0x289C204B35859bFb924B9C0759A4FE80f610671c'], // fGHO (Fluid)
];

// ─── Base ERC4626 positions ───────────────────────────────────────────────────
const BASE_VAULT_POSITIONS: [string, string][] = [
  ['0xBEEFE94c8aD530842bfE7d8B397938fFc1cb83b2', '0x289C204B35859bFb924B9C0759A4FE80f610671c'], // steakUSDC Prime
  ['0xbeef0e0834849aCC03f0089F01f4F1Eeb06873C9', '0x289C204B35859bFb924B9C0759A4FE80f610671c'], // steakUSDC Prime V2
  ['0xeE8F4eC5672F09119b96Ab6fB59C27E1b7e44b61', '0x289C204B35859bFb924B9C0759A4FE80f610671c'], // gtUSDCp
  ['0x050cE30b927Da55177A4914EC73480238BAD56f0', '0x289C204B35859bFb924B9C0759A4FE80f610671c'], // gtUSDCp V2
];

// ─── Plasma ERC4626 positions ─────────────────────────────────────────────────
const PLASMA_VAULT_POSITIONS: [string, string][] = [
  ['0x1DD4b13fcAE900C60a350589BE8052959D2Ed27B', '0x289C204B35859bFb924B9C0759A4FE80f610671c'], // fUSDT0
  ['0x1DD4b13fcAE900C60a350589BE8052959D2Ed27B', '0x9A319b57B80c50f8B19DB35D3224655F3aDd8E4f'], // fUSDT0 adapter2
  ['0xd8f824d4252caE7d5E49B95d47B0EfAfe6f2d570', '0x9A319b57B80c50f8B19DB35D3224655F3aDd8E4f'], // fUSDe
  ['0x96D7478219bFCc9B5d25F08ccb983815ee9D05e2', '0x289C204B35859bFb924B9C0759A4FE80f610671c'], // fGHO
  ['0xe818ad0D20D504C55601b9d5e0E137314414dec4', '0x9A319b57B80c50f8B19DB35D3224655F3aDd8E4f'], // k3USDT
  ['0x9c46EE1f01d2b551048F5fF99a4659D98d04BED1', '0x9A319b57B80c50f8B19DB35D3224655F3aDd8E4f'], // 246USDT0
  ['0xa5EeD1615cd883dD6883ca3a385F525e3bEB4E79', '0x9A319b57B80c50f8B19DB35D3224655F3aDd8E4f'], // Re7USDT0Core
  ['0x66bE42a0BdA425A8C3b3c2cF4F4Cb9EDfcAEd21d', '0x9A319b57B80c50f8B19DB35D3224655F3aDd8E4f'], // hyperEulerUSDT
];

// ─── Monad ERC4626 positions ──────────────────────────────────────────────────
const MONAD_VAULT_POSITIONS: [string, string][] = [
  ['0x32841A8511D5c2c5b253f45668780B99139e476D', '0x289C204B35859bFb924B9C0759A4FE80f610671c'], // grove-bbqAUSD
  ['0x88e0994E8130EF72bf614CBBcF722839B167c8d1', '0x0db79c0770E1C647b8Bb76D94C22420fAA7Ac181'], // cAUSD (Curvance)
  ['0xbeeffb65df79baac701307c9605b7ab207355fdb', '0x289C204B35859bFb924B9C0759A4FE80f610671c'], // bbqUSD1
];

// ─── HyperEVM ERC4626 positions ───────────────────────────────────────────────
const HYPEREVM_VAULT_POSITIONS: [string, string][] = [
  ['0x8A862fD6c12f9ad34C9c2ff45AB2b6712e8CEa27', '0x289C204B35859bFb924B9C0759A4FE80f610671c'], // feUSDC
  ['0x207ccaE51Ad2E1C240C4Ab4c94b670D438d2201C', '0x289C204B35859bFb924B9C0759A4FE80f610671c'], // feUSDH
];

// ─── Katana ERC4626 positions ─────────────────────────────────────────────────
const KATANA_VAULT_POSITIONS: [string, string][] = [
  ['0x61D4F9D3797BA4dA152238c53a6f93Fb665C3c1d', '0x289C204B35859bFb924B9C0759A4FE80f610671c'], // steakUSDC
];

// ─── Optimism ERC4626 positions ───────────────────────────────────────────────
const OP_VAULT_POSITIONS: [string, string][] = [
  ['0xc30ce6a5758786e0f640cc5f881dd96e9a1c5c59', '0x289C204B35859bFb924B9C0759A4FE80f610671c'], // gtUSDCp
];

// ─── BSC ERC4626 positions ────────────────────────────────────────────────────
const BSC_VAULT_POSITIONS: [string, string][] = [
  ['0xA5b8FCa32E5252B0B58EAbf1A8c79d958F8EE6A2', '0x289C204B35859bFb924B9C0759A4FE80f610671c'], // fvUSDT (Venus)
];

// ─── Berachain ERC4626 positions ─────────────────────────────────────────────
const BERA_VAULT_POSITIONS: [string, string][] = [
  ['0x551FB0309dd7E1C6E1A59d9389ef10dA864a552e', '0x0db79c0770E1C647b8Bb76D94C22420fAA7Ac181'], // Ethena sUSDe
  ['0x30BbA9CD9Eb8c95824aa42Faa1Bb397b07545bc1', '0x0db79c0770E1C647b8Bb76D94C22420fAA7Ac181'], // Re7HONEY
];

// ─── Plume ERC4626 positions ──────────────────────────────────────────────────
const PLUME_VAULT_POSITIONS: [string, string][] = [
  ['0xc0Df5784f28046D11813356919B869dDA5815B16', '0x98Cb8fD0D8b6bf104Fa2B5BAB91fd4B0fcC43A47'], // Re7 pUSD
];

// ─── Mantle rebasing (Aave aTokens) ──────────────────────────────────────────
const REBASE_MANTLE_POSITIONS: [string, string, number][] = [
  ['0x7053bad224f0c021839f6ac645bdae5f8b585b69', '0x3063C5907FAa10c01B242181Aa689bEb23D2BD65', 6],  // aManUSDT0
  ['0x8917d4eE4609f991b559DAF8D0aD1b892c13B127', '0x3063C5907FAa10c01B242181Aa689bEb23D2BD65', 18], // aManGHO
];

// ─── Plasma rebasing (Aave aTokens) ──────────────────────────────────────────
const REBASE_PLASMA_POSITIONS: [string, string, number][] = [
  ['0xAd571979b4245E163A7E2119EB4dFd94AfDaebC5', '0x3063C5907FAa10c01B242181Aa689bEb23D2BD65', 18], // aPlaGHO
  ['0x7519403E12111ff6b710877Fcd821D0c12CAF43A', '0x9A319b57B80c50f8B19DB35D3224655F3aDd8E4f', 18], // aPlaUSDe
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function computeErc4626Yield(
  positions: [string, string][],
  balances: any[], ratesFrom: any[], ratesTo: any[],
): bigint {
  let total = 0n;
  for (let i = 0; i < positions.length; i++) {
    if (!balances[i] || !ratesFrom[i] || !ratesTo[i]) continue;
    const rateDelta = BigInt(ratesTo[i]) - BigInt(ratesFrom[i]);
    if (rateDelta <= 0n) continue;
    let yieldRaw = BigInt(balances[i]) * rateDelta / WAD;
    if (BigInt(ratesFrom[i]) < USDC_THRESHOLD) yieldRaw *= SCALE_6DEC;
    total += yieldRaw;
  }
  return total;
}

function computeRebaseYield(
  positions: [string, string, number][],
  balsFrom: any[], balsTo: any[],
): bigint {
  let total = 0n;
  for (let i = 0; i < positions.length; i++) {
    if (!balsFrom[i] || !balsTo[i]) continue;
    let delta = BigInt(balsTo[i]) - BigInt(balsFrom[i]);
    if (delta <= 0n) continue;
    if (positions[i][2] === 6) delta *= SCALE_6DEC;
    total += delta;
  }
  return total;
}

function computeMorphoBlueYield(
  marketsFrom: any[], marketsTo: any[],
  positionsFrom: any[], positionsTo: any[],
): bigint {
  let total = 0n;
  for (let i = 0; i < marketsFrom.length; i++) {
    const mf = marketsFrom[i], mt = marketsTo[i], pf = positionsFrom[i], pt = positionsTo[i];
    if (!mf || !mt || !pf || !pt) continue;
    const totSharesFrom = BigInt(mf[1]);
    const totSharesTo   = BigInt(mt[1]);
    if (totSharesFrom === 0n || totSharesTo === 0n) continue;
    const valueFrom = BigInt(pf[0]) * BigInt(mf[0]) / totSharesFrom;
    const valueTo   = BigInt(pt[0]) * BigInt(mt[0]) / totSharesTo;
    const delta = valueTo - valueFrom;
    if (delta <= 0n) continue;
    total += delta * SCALE_6DEC; // loan asset is USDC (6 dec); scale to 18-dec rUSD
  }
  return total;
}

async function collectMerklStableYield(
  options: FetchOptions,
  stables: [string, number][],
): Promise<bigint> {
  const distTopic   = padAddr(MERKL_DISTRIBUTOR_ETH);
  const transferAbi = 'event Transfer(address indexed from, address indexed to, uint256 value)';
  const logArrays   = await Promise.all(
    stables.map(([addr]) => options.getLogs({ target: addr, eventAbi: transferAbi,
      topics: [TRANSFER_TOPIC, distTopic, null as any] })),
  );
  let total = 0n;
  for (let i = 0; i < stables.length; i++) {
    const dec = stables[i][1];
    for (const log of logArrays[i]) {
      if (!MERKL_RECIPIENTS_SET.has((log.to as string).toLowerCase())) continue;
      const raw = BigInt(log.value);
      total += dec === 6 ? raw * SCALE_6DEC : raw;
    }
  }
  return total;
}

// ─── prefetch ─────────────────────────────────────────────────────────────────

async function prefetch(options: FetchOptions): Promise<any> {
  const balCalls   = (pos: [string, string][])          => pos.map(([v, o]) => ({ target: v, params: [o] }));
  const rateCalls  = (pos: [string, string][])          => pos.map(([v])    => ({ target: v, params: [WAD.toString()] }));
  const rebalCalls = (pos: [string, string, number][])  => pos.map(([t, o]) => ({ target: t, params: [o] }));

  const [
    wsrRateFrom, wsrRateTo, priceFrom, priceTo,
    posBalances,        posRatesFrom,        posRatesTo,
    rebaseEthBalsFrom,  rebaseEthBalsTo,
    arbBalances,        arbRatesFrom,        arbRatesTo,
    baseBalances,       baseRatesFrom,       baseRatesTo,
    plasmaBalances,     plasmaRatesFrom,     plasmaRatesTo,
    monadBalances,      monadRatesFrom,      monadRatesTo,
    hyperevmBalances,   hyperevmRatesFrom,   hyperevmRatesTo,
    katanaBalances,     katanaRatesFrom,     katanaRatesTo,
    opBalances,         opRatesFrom,         opRatesTo,
    bscBalances,        bscRatesFrom,        bscRatesTo,
    rebaseMantleBalsFrom, rebaseMantleBalsTo,
    rebasePlasmaBalsFrom, rebasePlasmaBalsTo,
    monarchMarketFrom, monarchMarketTo, monarchPosFrom, monarchPosTo,
    beraBalances,        beraRatesFrom,        beraRatesTo,
    plumeBalances,       plumeRatesFrom,       plumeRatesTo,
  ] = await Promise.all([
    options.fromApi.call({ target: WSRUSD,        abi: convertToAssetsAbi,  params: [WAD.toString()], chain: CHAIN.ETHEREUM }),
    options.toApi.call({   target: WSRUSD,        abi: convertToAssetsAbi,  params: [WAD.toString()], chain: CHAIN.ETHEREUM }),
    options.fromApi.call({ target: SAVING_MODULE, abi: 'uint256:currentPrice',                        chain: CHAIN.ETHEREUM }),
    options.toApi.call({   target: SAVING_MODULE, abi: 'uint256:currentPrice',                        chain: CHAIN.ETHEREUM }),
    // ETH ERC4626
    options.fromApi.multiCall({ abi: balanceOfAbi,       calls: balCalls(VAULT_POSITIONS),  permitFailure: true, chain: CHAIN.ETHEREUM }),
    options.fromApi.multiCall({ abi: convertToAssetsAbi, calls: rateCalls(VAULT_POSITIONS), permitFailure: true, chain: CHAIN.ETHEREUM }),
    options.toApi.multiCall({   abi: convertToAssetsAbi, calls: rateCalls(VAULT_POSITIONS), permitFailure: true, chain: CHAIN.ETHEREUM }),
    // ETH rebasing
    options.fromApi.multiCall({ abi: balanceOfAbi, calls: rebalCalls(REBASE_ETH_POSITIONS), permitFailure: true, chain: CHAIN.ETHEREUM }),
    options.toApi.multiCall({   abi: balanceOfAbi, calls: rebalCalls(REBASE_ETH_POSITIONS), permitFailure: true, chain: CHAIN.ETHEREUM }),
    // Arbitrum ERC4626
    options.fromApi.multiCall({ abi: balanceOfAbi,       calls: balCalls(ARB_VAULT_POSITIONS),  permitFailure: true, chain: CHAIN.ARBITRUM }),
    options.fromApi.multiCall({ abi: convertToAssetsAbi, calls: rateCalls(ARB_VAULT_POSITIONS), permitFailure: true, chain: CHAIN.ARBITRUM }),
    options.toApi.multiCall({   abi: convertToAssetsAbi, calls: rateCalls(ARB_VAULT_POSITIONS), permitFailure: true, chain: CHAIN.ARBITRUM }),
    // Base ERC4626
    options.fromApi.multiCall({ abi: balanceOfAbi,       calls: balCalls(BASE_VAULT_POSITIONS),  permitFailure: true, chain: CHAIN.BASE }),
    options.fromApi.multiCall({ abi: convertToAssetsAbi, calls: rateCalls(BASE_VAULT_POSITIONS), permitFailure: true, chain: CHAIN.BASE }),
    options.toApi.multiCall({   abi: convertToAssetsAbi, calls: rateCalls(BASE_VAULT_POSITIONS), permitFailure: true, chain: CHAIN.BASE }),
    // Plasma ERC4626
    options.fromApi.multiCall({ abi: balanceOfAbi,       calls: balCalls(PLASMA_VAULT_POSITIONS),  permitFailure: true, chain: CHAIN.PLASMA }),
    options.fromApi.multiCall({ abi: convertToAssetsAbi, calls: rateCalls(PLASMA_VAULT_POSITIONS), permitFailure: true, chain: CHAIN.PLASMA }),
    options.toApi.multiCall({   abi: convertToAssetsAbi, calls: rateCalls(PLASMA_VAULT_POSITIONS), permitFailure: true, chain: CHAIN.PLASMA }),
    // Monad ERC4626
    options.fromApi.multiCall({ abi: balanceOfAbi,       calls: balCalls(MONAD_VAULT_POSITIONS),  permitFailure: true, chain: CHAIN.MONAD }),
    options.fromApi.multiCall({ abi: convertToAssetsAbi, calls: rateCalls(MONAD_VAULT_POSITIONS), permitFailure: true, chain: CHAIN.MONAD }),
    options.toApi.multiCall({   abi: convertToAssetsAbi, calls: rateCalls(MONAD_VAULT_POSITIONS), permitFailure: true, chain: CHAIN.MONAD }),
    // HyperEVM ERC4626
    options.fromApi.multiCall({ abi: balanceOfAbi,       calls: balCalls(HYPEREVM_VAULT_POSITIONS),  permitFailure: true, chain: CHAIN.HYPERLIQUID }),
    options.fromApi.multiCall({ abi: convertToAssetsAbi, calls: rateCalls(HYPEREVM_VAULT_POSITIONS), permitFailure: true, chain: CHAIN.HYPERLIQUID }),
    options.toApi.multiCall({   abi: convertToAssetsAbi, calls: rateCalls(HYPEREVM_VAULT_POSITIONS), permitFailure: true, chain: CHAIN.HYPERLIQUID }),
    // Katana ERC4626
    options.fromApi.multiCall({ abi: balanceOfAbi,       calls: balCalls(KATANA_VAULT_POSITIONS),  permitFailure: true, chain: CHAIN.KATANA }),
    options.fromApi.multiCall({ abi: convertToAssetsAbi, calls: rateCalls(KATANA_VAULT_POSITIONS), permitFailure: true, chain: CHAIN.KATANA }),
    options.toApi.multiCall({   abi: convertToAssetsAbi, calls: rateCalls(KATANA_VAULT_POSITIONS), permitFailure: true, chain: CHAIN.KATANA }),
    // Optimism ERC4626
    options.fromApi.multiCall({ abi: balanceOfAbi,       calls: balCalls(OP_VAULT_POSITIONS),  permitFailure: true, chain: CHAIN.OPTIMISM }),
    options.fromApi.multiCall({ abi: convertToAssetsAbi, calls: rateCalls(OP_VAULT_POSITIONS), permitFailure: true, chain: CHAIN.OPTIMISM }),
    options.toApi.multiCall({   abi: convertToAssetsAbi, calls: rateCalls(OP_VAULT_POSITIONS), permitFailure: true, chain: CHAIN.OPTIMISM }),
    // BSC ERC4626
    options.fromApi.multiCall({ abi: balanceOfAbi,       calls: balCalls(BSC_VAULT_POSITIONS),  permitFailure: true, chain: CHAIN.BSC }),
    options.fromApi.multiCall({ abi: convertToAssetsAbi, calls: rateCalls(BSC_VAULT_POSITIONS), permitFailure: true, chain: CHAIN.BSC }),
    options.toApi.multiCall({   abi: convertToAssetsAbi, calls: rateCalls(BSC_VAULT_POSITIONS), permitFailure: true, chain: CHAIN.BSC }),
    // Mantle rebasing
    options.fromApi.multiCall({ abi: balanceOfAbi, calls: rebalCalls(REBASE_MANTLE_POSITIONS), permitFailure: true, chain: CHAIN.MANTLE }),
    options.toApi.multiCall({   abi: balanceOfAbi, calls: rebalCalls(REBASE_MANTLE_POSITIONS), permitFailure: true, chain: CHAIN.MANTLE }),
    // Plasma rebasing
    options.fromApi.multiCall({ abi: balanceOfAbi, calls: rebalCalls(REBASE_PLASMA_POSITIONS), permitFailure: true, chain: CHAIN.PLASMA }),
    options.toApi.multiCall({   abi: balanceOfAbi, calls: rebalCalls(REBASE_PLASMA_POSITIONS), permitFailure: true, chain: CHAIN.PLASMA }),
    // Morpho Blue direct markets (8 Monarch markets, loan asset USDC)
    options.fromApi.multiCall({ target: MORPHO_BLUE, abi: morphoMarketAbi,   calls: MONARCH_MARKET_IDS.map(id => ({ params: [id] })),                  permitFailure: true, chain: CHAIN.ETHEREUM }),
    options.toApi.multiCall({   target: MORPHO_BLUE, abi: morphoMarketAbi,   calls: MONARCH_MARKET_IDS.map(id => ({ params: [id] })),                  permitFailure: true, chain: CHAIN.ETHEREUM }),
    options.fromApi.multiCall({ target: MORPHO_BLUE, abi: morphoPositionAbi, calls: MONARCH_MARKET_IDS.map(id => ({ params: [id, MONARCH_WALLET] })), permitFailure: true, chain: CHAIN.ETHEREUM }),
    options.toApi.multiCall({   target: MORPHO_BLUE, abi: morphoPositionAbi, calls: MONARCH_MARKET_IDS.map(id => ({ params: [id, MONARCH_WALLET] })), permitFailure: true, chain: CHAIN.ETHEREUM }),
    // Bera ERC4626
    options.fromApi.multiCall({ abi: balanceOfAbi,       calls: balCalls(BERA_VAULT_POSITIONS),  permitFailure: true, chain: CHAIN.BERACHAIN }),
    options.fromApi.multiCall({ abi: convertToAssetsAbi, calls: rateCalls(BERA_VAULT_POSITIONS), permitFailure: true, chain: CHAIN.BERACHAIN }),
    options.toApi.multiCall({   abi: convertToAssetsAbi, calls: rateCalls(BERA_VAULT_POSITIONS), permitFailure: true, chain: CHAIN.BERACHAIN }),
    // Plume ERC4626
    options.fromApi.multiCall({ abi: balanceOfAbi,       calls: balCalls(PLUME_VAULT_POSITIONS),  permitFailure: true, chain: CHAIN.PLUME }),
    options.fromApi.multiCall({ abi: convertToAssetsAbi, calls: rateCalls(PLUME_VAULT_POSITIONS), permitFailure: true, chain: CHAIN.PLUME }),
    options.toApi.multiCall({   abi: convertToAssetsAbi, calls: rateCalls(PLUME_VAULT_POSITIONS), permitFailure: true, chain: CHAIN.PLUME }),
  ]);

  return {
    wsrRateFrom: wsrRateFrom.toString(), wsrRateTo: wsrRateTo.toString(),
    priceFrom:   priceFrom.toString(),   priceTo:   priceTo.toString(),
    posBalances, posRatesFrom, posRatesTo,
    rebaseEthBalsFrom, rebaseEthBalsTo,
    arbBalances, arbRatesFrom, arbRatesTo,
    baseBalances, baseRatesFrom, baseRatesTo,
    plasmaBalances, plasmaRatesFrom, plasmaRatesTo,
    monadBalances, monadRatesFrom, monadRatesTo,
    hyperevmBalances, hyperevmRatesFrom, hyperevmRatesTo,
    katanaBalances, katanaRatesFrom, katanaRatesTo,
    opBalances, opRatesFrom, opRatesTo,
    bscBalances, bscRatesFrom, bscRatesTo,
    rebaseMantleBalsFrom, rebaseMantleBalsTo,
    rebasePlasmaBalsFrom, rebasePlasmaBalsTo,
    monarchMarketFrom, monarchMarketTo, monarchPosFrom, monarchPosTo,
    beraBalances, beraRatesFrom, beraRatesTo,
    plumeBalances, plumeRatesFrom, plumeRatesTo,
  };
}

// ─── fetch ────────────────────────────────────────────────────────────────────

async function fetch(options: FetchOptions): Promise<FetchResult> {
  const {
    wsrRateFrom, wsrRateTo, priceFrom, priceTo,
    posBalances, posRatesFrom, posRatesTo,
    rebaseEthBalsFrom, rebaseEthBalsTo,
    arbBalances, arbRatesFrom, arbRatesTo,
    baseBalances, baseRatesFrom, baseRatesTo,
    plasmaBalances, plasmaRatesFrom, plasmaRatesTo,
    monadBalances, monadRatesFrom, monadRatesTo,
    hyperevmBalances, hyperevmRatesFrom, hyperevmRatesTo,
    katanaBalances, katanaRatesFrom, katanaRatesTo,
    opBalances, opRatesFrom, opRatesTo,
    bscBalances, bscRatesFrom, bscRatesTo,
    rebaseMantleBalsFrom, rebaseMantleBalsTo,
    rebasePlasmaBalsFrom, rebasePlasmaBalsTo,
    monarchMarketFrom, monarchMarketTo, monarchPosFrom, monarchPosTo,
    beraBalances, beraRatesFrom, beraRatesTo,
    plumeBalances, plumeRatesFrom, plumeRatesTo,
  } = options.preFetchedResults;

  const wsrRateDelta = BigInt(wsrRateTo) - BigInt(wsrRateFrom);
  const srPriceDelta = BigInt(priceTo)   - BigInt(priceFrom);

  const dailyFees              = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  if (options.chain === CHAIN.ETHEREUM) {
    // ERC4626 yield across all on-chain positions
    const erc4626Yield = computeErc4626Yield(VAULT_POSITIONS, posBalances, posRatesFrom, posRatesTo);
    if (erc4626Yield > 0n) dailyFees.add(RUSD, erc4626Yield, METRIC.ASSETS_YIELDS);

    // Balance-delta yield for Aave aTokens and other rebasing ERC20s
    const rebaseYield = computeRebaseYield(REBASE_ETH_POSITIONS, rebaseEthBalsFrom, rebaseEthBalsTo);
    if (rebaseYield > 0n) dailyFees.add(RUSD, rebaseYield, METRIC.ASSETS_YIELDS);

    // Morpho Blue direct market yield (Monarch mF-ONE, loan asset USDC)
    const morphoBlueYield = computeMorphoBlueYield(monarchMarketFrom, monarchMarketTo, monarchPosFrom, monarchPosTo);
    if (morphoBlueYield > 0n) dailyFees.add(RUSD, morphoBlueYield, METRIC.ASSETS_YIELDS);

    // Merkl reward claims: ERC20 transfers from distributor to tracked wallets
    const distributorTopic = padAddr(MERKL_DISTRIBUTOR_ETH);
    const transferAbi      = 'event Transfer(address indexed from, address indexed to, uint256 value)';
    const merklLogArrays = await Promise.all([
      ...MERKL_STABLES.map(([addr]) =>
        options.getLogs({ target: addr, eventAbi: transferAbi,
          topics: [TRANSFER_TOPIC, distributorTopic, null as any] })),
      ...MERKL_PRICED.map((addr) =>
        options.getLogs({ target: addr, eventAbi: transferAbi,
          topics: [TRANSFER_TOPIC, distributorTopic, null as any] })),
    ]);
    for (let i = 0; i < MERKL_STABLES.length; i++) {
      const [, decimals] = MERKL_STABLES[i];
      for (const log of merklLogArrays[i]) {
        if (!MERKL_RECIPIENTS_SET.has((log.to as string).toLowerCase())) continue;
        const raw = BigInt(log.value);
        const val = decimals === 6 ? raw * SCALE_6DEC : raw;
        dailyFees.add(RUSD, val, METRIC.ASSETS_YIELDS);
      }
    }
    for (let i = 0; i < MERKL_PRICED.length; i++) {
      const tokenAddr = MERKL_PRICED[i];
      for (const log of merklLogArrays[MERKL_STABLES.length + i]) {
        if (!MERKL_RECIPIENTS_SET.has((log.to as string).toLowerCase())) continue;
        dailyFees.add(tokenAddr, BigInt(log.value), METRIC.ASSETS_YIELDS);
      }
    }

    // FLUID native token rewards from treasury distributors
    const fluidLogs = (await Promise.all(
      FLUID_DISTRIBUTORS.map(dist => options.getLogs({ target: FLUID_TOKEN, eventAbi: transferAbi,
        topics: [TRANSFER_TOPIC, padAddr(dist), null as any] })),
    )).flat();
    for (const log of fluidLogs) {
      if (!MERKL_RECIPIENTS_SET.has((log.to as string).toLowerCase())) continue;
      dailyFees.add(FLUID_TOKEN, BigInt(log.value), METRIC.ASSETS_YIELDS);
    }

    // Uniswap V4 fee harvests: ModifyLiquidity on PoolManager (USDe/USDT pool)
    const v4LogsEth = await options.getLogs({
      target: UNI_V4_PM,
      topics: [UNI_V4_HARVEST_TOPIC, null as any, padAddr(MONARCH_WALLET)],
    });
    for (const log of v4LogsEth) {
      const d = (log as any).data as string; // "0x" + hex; [32:64]=fees0(18dec), [64:96]=fees1(6dec)
      const fees0 = BigInt('0x' + d.slice(66, 130));
      const fees1 = BigInt('0x' + d.slice(130, 194));
      if (fees0 > 0n) dailyFees.add(RUSD, fees0,              METRIC.ASSETS_YIELDS); // USDe 18-dec
      if (fees1 > 0n) dailyFees.add(RUSD, fees1 * SCALE_6DEC, METRIC.ASSETS_YIELDS); // USDT 6-dec
    }

    // Cost of Revenue: yield paid to wsrUSD + srUSD holders
    const [wsrSupply, srSupply] = await options.api.multiCall({
      abi: 'uint256:totalSupply',
      calls: [{ target: WSRUSD }, { target: SRUSD }],
    });
    const wsrTotalYield = BigInt(wsrSupply) * wsrRateDelta / WAD;
    const srYield       = BigInt(srSupply)  * srPriceDelta / PRICE_SCALE;
    if (wsrTotalYield !== 0n) dailySupplySideRevenue.add(RUSD, wsrTotalYield, METRIC.ASSETS_YIELDS);
    if (srYield       !== 0n) dailySupplySideRevenue.add(RUSD, srYield,       METRIC.ASSETS_YIELDS);

  } else if (options.chain === CHAIN.ARBITRUM) {
    const y = computeErc4626Yield(ARB_VAULT_POSITIONS, arbBalances, arbRatesFrom, arbRatesTo);
    if (y > 0n) dailyFees.add(RUSD, y, METRIC.ASSETS_YIELDS);
    const merklY = await collectMerklStableYield(options, MERKL_STABLES_ARB);
    if (merklY > 0n) dailyFees.add(RUSD, merklY, METRIC.ASSETS_YIELDS);
    try {
      const oftSupply = await options.api.call({ target: WSRUSD_OFT, abi: 'uint256:totalSupply' });
      const oftYield  = BigInt(oftSupply) * wsrRateDelta / WAD;
      if (oftYield !== 0n) dailySupplySideRevenue.add(RUSD, oftYield, METRIC.ASSETS_YIELDS);
    } catch (e) {
      console.error(`[reservoir-protocol] WSRUSD_OFT.totalSupply failed on ${options.chain}:`, e);
    }

  } else if (options.chain === CHAIN.BASE) {
    const y = computeErc4626Yield(BASE_VAULT_POSITIONS, baseBalances, baseRatesFrom, baseRatesTo);
    if (y > 0n) dailyFees.add(RUSD, y, METRIC.ASSETS_YIELDS);
    const merklY = await collectMerklStableYield(options, MERKL_STABLES_BASE);
    if (merklY > 0n) dailyFees.add(RUSD, merklY, METRIC.ASSETS_YIELDS);

  } else if (options.chain === CHAIN.PLASMA) {
    const erc4626Y = computeErc4626Yield(PLASMA_VAULT_POSITIONS, plasmaBalances, plasmaRatesFrom, plasmaRatesTo);
    if (erc4626Y > 0n) dailyFees.add(RUSD, erc4626Y, METRIC.ASSETS_YIELDS);
    const rebaseY = computeRebaseYield(REBASE_PLASMA_POSITIONS, rebasePlasmaBalsFrom, rebasePlasmaBalsTo);
    if (rebaseY > 0n) dailyFees.add(RUSD, rebaseY, METRIC.ASSETS_YIELDS);

  } else if (options.chain === CHAIN.MANTLE) {
    const y = computeRebaseYield(REBASE_MANTLE_POSITIONS, rebaseMantleBalsFrom, rebaseMantleBalsTo);
    if (y > 0n) dailyFees.add(RUSD, y, METRIC.ASSETS_YIELDS);

  } else if (options.chain === CHAIN.MONAD) {
    const y = computeErc4626Yield(MONAD_VAULT_POSITIONS, monadBalances, monadRatesFrom, monadRatesTo);
    if (y > 0n) dailyFees.add(RUSD, y, METRIC.ASSETS_YIELDS);
    try {
      const oftSupply = await options.api.call({ target: WSRUSD_OFT, abi: 'uint256:totalSupply' });
      const oftYield  = BigInt(oftSupply) * wsrRateDelta / WAD;
      if (oftYield !== 0n) dailySupplySideRevenue.add(RUSD, oftYield, METRIC.ASSETS_YIELDS);
    } catch (e) {
      console.error(`[reservoir-protocol] WSRUSD_OFT.totalSupply failed on ${options.chain}:`, e);
    }

  } else if (options.chain === CHAIN.HYPERLIQUID) {
    const y = computeErc4626Yield(HYPEREVM_VAULT_POSITIONS, hyperevmBalances, hyperevmRatesFrom, hyperevmRatesTo);
    if (y > 0n) dailyFees.add(RUSD, y, METRIC.ASSETS_YIELDS);

  } else if (options.chain === CHAIN.KATANA) {
    const y = computeErc4626Yield(KATANA_VAULT_POSITIONS, katanaBalances, katanaRatesFrom, katanaRatesTo);
    if (y > 0n) dailyFees.add(RUSD, y, METRIC.ASSETS_YIELDS);

  } else if (options.chain === CHAIN.OPTIMISM) {
    const y = computeErc4626Yield(OP_VAULT_POSITIONS, opBalances, opRatesFrom, opRatesTo);
    if (y > 0n) dailyFees.add(RUSD, y, METRIC.ASSETS_YIELDS);
    const merklY = await collectMerklStableYield(options, MERKL_STABLES_OP);
    if (merklY > 0n) dailyFees.add(RUSD, merklY, METRIC.ASSETS_YIELDS);

  } else if (options.chain === CHAIN.BSC) {
    const y = computeErc4626Yield(BSC_VAULT_POSITIONS, bscBalances, bscRatesFrom, bscRatesTo);
    if (y > 0n) dailyFees.add(RUSD, y, METRIC.ASSETS_YIELDS);
    // Uniswap V4 fee harvests on BNB (USDT/USDC pool; both 18-dec on BSC)
    const v4LogsBsc = await options.getLogs({
      target: UNI_V4_PM,
      topics: [UNI_V4_HARVEST_TOPIC, null as any, padAddr(MONARCH_WALLET)],
    });
    for (const log of v4LogsBsc) {
      const d = (log as any).data as string;
      const fees0 = BigInt('0x' + d.slice(66, 130));
      const fees1 = BigInt('0x' + d.slice(130, 194));
      if (fees0 > 0n) dailyFees.add(RUSD, fees0, METRIC.ASSETS_YIELDS);
      if (fees1 > 0n) dailyFees.add(RUSD, fees1, METRIC.ASSETS_YIELDS);
    }

  } else if (options.chain === CHAIN.BERACHAIN) {
    const y = computeErc4626Yield(BERA_VAULT_POSITIONS, beraBalances, beraRatesFrom, beraRatesTo);
    if (y > 0n) dailyFees.add(RUSD, y, METRIC.ASSETS_YIELDS);

  } else if (options.chain === CHAIN.PLUME) {
    const y = computeErc4626Yield(PLUME_VAULT_POSITIONS, plumeBalances, plumeRatesFrom, plumeRatesTo);
    if (y > 0n) dailyFees.add(RUSD, y, METRIC.ASSETS_YIELDS);

  } else {
    // SEI and any future OFT-only chains: fees = supply = OFT yield (revenue = 0)
    try {
      const oftSupply = await options.api.call({ target: WSRUSD_OFT, abi: 'uint256:totalSupply' });
      const oftYield  = BigInt(oftSupply) * wsrRateDelta / WAD;
      if (oftYield !== 0n) {
        dailyFees.add(RUSD, oftYield, METRIC.ASSETS_YIELDS);
        dailySupplySideRevenue.add(RUSD, oftYield, METRIC.ASSETS_YIELDS);
      }
    } catch (e) {
      console.error(`[reservoir-protocol] WSRUSD_OFT.totalSupply failed on ${options.chain}:`, e);
    }
  }

  return { dailyFees, dailySupplySideRevenue };
}

// ─── Metadata ─────────────────────────────────────────────────────────────────

const methodology = {
  Fees: 'Gross Protocol Revenue: ERC4626 yield (shares × ΔconvertToAssets / WAD), Aave aToken balance-delta yield, Morpho Blue direct market yield, and Merkl reward claims — across all on-chain positions (Euler, Morpho, Fluid, InfiniFi, Cap, Ethena, Hyperithm, IPOR, fund-wrapper vaults, Aave ETH/Mantle/Plasma, Treehouse, Dolomite) on Ethereum, Arbitrum, Base, Plasma, Monad, HyperEVM, Katana, Optimism, and BSC. Off-chain RWA, Solana, and Uniswap LP yield are not capturable on-chain.',
  SupplySideRevenue: 'Cost of Revenue: yield paid to wsrUSD holders (totalSupply × Δexchange rate / WAD) plus srUSD holders (totalSupply × ΔSavingModule price / PRICE_SCALE) on Ethereum; OFT totalSupply × wsrRateDelta / WAD on Arbitrum, Monad, and SEI.',
  Revenue: 'Gross Profit = Fees − SupplySideRevenue.',
};

const breakdownMethodology = {
  Fees: {
    [METRIC.ASSETS_YIELDS]: 'Σ (vault_shares × ΔconvertToAssets / WAD) for ERC4626 vaults + Σ ΔbalanceOf for rebasing aTokens + Morpho Blue direct market yield + Merkl distributor ERC20 transfers to tracked wallets.',
  },
  SupplySideRevenue: {
    [METRIC.ASSETS_YIELDS]: 'wsrUSD totalSupply × Δexchange rate / WAD + srUSD totalSupply × ΔSavingModule price / PRICE_SCALE (ETH); OFT totalSupply × wsrRateDelta / WAD (ARB/MONAD/SEI).',
  },
  Revenue: {
    [METRIC.ASSETS_YIELDS]: 'On-chain yield minus cost of revenue. Negative values occur when on-chain income is less than yield committed to wsrUSD + srUSD holders.',
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  prefetch,
  fetch,
  pullHourly: true,
  methodology,
  breakdownMethodology,
  adapter: {
    [CHAIN.ETHEREUM]:    { start: '2025-04-17' },
    [CHAIN.ARBITRUM]:    { start: '2025-05-12' },
    [CHAIN.SEI]:         { start: '2025-06-13' },
    [CHAIN.MONAD]:       { start: '2026-01-01' },
    [CHAIN.BASE]:        { start: '2026-01-01' },
    [CHAIN.PLASMA]:      { start: '2026-03-01' },
    [CHAIN.MANTLE]:      { start: '2026-02-01' },
    [CHAIN.HYPERLIQUID]: { start: '2026-01-01' },
    [CHAIN.KATANA]:      { start: '2026-04-01' },
    [CHAIN.OPTIMISM]:    { start: '2026-01-01' },
    [CHAIN.BSC]:         { start: '2025-05-12' },
    [CHAIN.BERACHAIN]:   { start: '2026-01-01' },
    [CHAIN.PLUME]:       { start: '2026-01-01' },
  },
  allowNegativeValue: true,
  doublecounted: true,
};

export default adapter;
