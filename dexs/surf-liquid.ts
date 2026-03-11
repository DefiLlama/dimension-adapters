import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

// V1 vaults (hardcoded, no factory)
const V1_VAULTS = [
  "0xd8a25Fc190a1E24d57a8d7A1A832B964817c6B90",
  "0x6485456Dd976657b8d783D9715AB6B4354a17A5B",
  "0x7d16e8A0f4B7dfAE9e2ec620E58662ceD958DFB4",
  "0xce469511382aC907fC1F84d22936F52c7eB7E3b2",
  "0xA10C29C065bEa713aC7a00290bf5CdC45cB78f4a",
  "0xea52A5c18DC3c65b7AD090698C62CD9ca02D106D",
  "0x6d1D4F7e1ADe6ED118C61e86A33C64B2B54FceF5",
  "0x6a4CF8866E6bBdDde0a67aE688E22bEdc31d304c",
  "0x41004b96fC710000476554eebeDB54Ad2025e8BF",
  "0xC9a616852087952991e3C9b7BEd1F3dda2DD1b5F",
];

const V2_FACTORY = "0x1D283b668F947E03E8ac8ce8DA5505020434ea0E";
const V3_FACTORY = "0xf1d64dee9f8e109362309a4bfbb523c8e54fa1aa";
const SURF_STAKING = "0xB0fDFc081310A5914c2d2c97e7582F4De12FA9d6";
const SURF_TOKEN = "0xcdca2eaae4a8a6b83d7a3589946c2301040dafbf";
const USDC = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";

// V2 events: data = uint256 amount (USDC, 6 decimals)
const V2_DEPOSIT = "0x1aa88527987680f71e6ace8f3d2ab4871db1862850458125715e5175f088c609";
const V2_WITHDRAWAL = "0x2717ead6b9200dd235aad468c9809ea400fe33ac69b5bfaa6d3e90fc922b6398";
const V2_REBALANCE = "0x4ce94e8bd94f62017197ba464f629a366572732970f6fe47c76f97bb53f76303";

// V3 events: topic1 = indexed token address, data = uint256 amount
const V3_DEPOSIT_1 = "0x268c2c6d010a7b0a0c1bfa0c35fd165097626036f72cd52f416fbf0f84236940";
const V3_DEPOSIT_2 = "0x3bc57f469ad6d10d7723ea226cd22bd2b9e527def2b529f6ab44645a16689582";
const V3_WITHDRAWAL = "0x342e7ff505a8a0364cd0dc2ff195c315e43bce86b204846ecd36913e117b109e";
const V3_REBALANCE = "0xe26365f32dd2a1a1a322c5fba39361fcd955999bdabd2121b6864894790cded4";

// Staking events: data first 32 bytes = SURF amount (18 decimals)
const SURF_STAKE = "0xf556991011e831bcfac4f406d547e5e32cdd98267efab83935230d5f8d02c446";
const SURF_CLAIM = "0x9cdcf2f7714cca3508c7f0110b04a90a80a3a8dd0e35de99689db74d28c5383e";

// CreatorBid events on SURF token contract
const CB_SUBSCRIBE = "0x4b90d6788928d63c1821907a6a8b95f40d26562d8fe41b105f7489db9966dfcb";
const CB_CLAIM = "0xfe87524983023b305b62c951a20ce614fdd20a03f0ad63190a82e7f04eb281f5";

// V3 factory vault deployment event
const V3_VAULT_DEPLOYED = "0x30f7c1411599514d4a6ee3d132cced214b34bbe4c49d77f74391224dc6d8d635";

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const api = options.api;

  // --- Discover vault addresses ---

  // V2 vaults from factory
  const totalV2 = await api.call({ abi: "uint256:getTotalVaults", target: V2_FACTORY });
  const v2Infos = await api.multiCall({
    abi: "function getVaultInfo(uint256) view returns (address, address, address, uint256, bytes32, uint256)",
    calls: [...Array(Number(totalV2)).keys()].map((i: number) => ({ target: V2_FACTORY, params: [i] })),
  });
  const v2Vaults: string[] = v2Infos.map((info: any) => info[0]);

  // V3 vaults from factory events (cached in cloud)
  const v3DeployLogs = await options.getLogs({
    target: V3_FACTORY,
    topics: [V3_VAULT_DEPLOYED],
    fromBlock: 38856207,
    cacheInCloud: true,
  });
  const v3Vaults: string[] = v3DeployLogs.map((l: any) => "0x" + l.topics[1].slice(26));

  const allVaults = [...V1_VAULTS, ...v2Vaults, ...v3Vaults];

  // --- V2-style vault events (data = USDC amount) ---
  for (const topic of [V2_DEPOSIT, V2_WITHDRAWAL, V2_REBALANCE]) {
    const logs = await options.getLogs({ targets: allVaults, topics: [topic] });
    for (const log of logs as any[]) {
      dailyVolume.add(USDC, log.data);
    }
  }

  // --- V3-style vault events (topic1 = token address, data = amount) ---
  for (const topic of [V3_DEPOSIT_1, V3_DEPOSIT_2, V3_WITHDRAWAL, V3_REBALANCE]) {
    const logs = await options.getLogs({ targets: allVaults, topics: [topic] });
    for (const log of logs as any[]) {
      const token = "0x" + log.topics[1].slice(26);
      dailyVolume.add(token, log.data);
    }
  }

  // --- SURF staking events (first 32 bytes of data = amount) ---
  for (const topic of [SURF_STAKE, SURF_CLAIM]) {
    const logs = await options.getLogs({ target: SURF_STAKING, topics: [topic] });
    for (const log of logs as any[]) {
      const amount = "0x" + log.data.slice(2, 66);
      dailyVolume.add(SURF_TOKEN, amount);
    }
  }

  // --- CreatorBid subscribe (data = SURF amount) ---
  const subscribeLogs = await options.getLogs({ target: SURF_TOKEN, topics: [CB_SUBSCRIBE] });
  for (const log of subscribeLogs as any[]) {
    dailyVolume.add(SURF_TOKEN, log.data);
  }

  // --- CreatorBid claim (second 32 bytes of data = SURF amount) ---
  const claimLogs = await options.getLogs({ target: SURF_TOKEN, topics: [CB_CLAIM] });
  for (const log of claimLogs as any[]) {
    const amount = "0x" + log.data.slice(66, 130);
    dailyVolume.add(SURF_TOKEN, amount);
  }

  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.BASE],
  start: "2025-10-01",
  methodology: {
    Volume: "Total capital flow through Surf Liquid protocol including vault deposits, withdrawals, rebalances, SURF staking, and CreatorBid subscriptions.",
  },
};

export default adapter;
