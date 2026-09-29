import { FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

// Shared between the volume adapter (dexs/homelander.ts) and the fee adapter
// (fees/homelander/index.ts): everything the Homelander plugin is deployed as
// on each chain, and one pass over a day of its pools' swaps.

export interface Distributor {
  address: string;
  /**
   * What the protocol keeps of a capture, and from which block.
   *
   * The weights are not in the payout event: they live in the distributor's own
   * share config, announced on chain as DefaultConfigSet / ConfigSet, and they
   * have been changed over the life of some deployments. Reading that history
   * on every run means scanning each distributor from its deploy block, which
   * the public nodes on one of these chains refuse outright, so the
   * announcements are transcribed here. Each entry is a block and what the
   * protocol's own payout addresses added up to from that block on, out of
   * 10,000.
   *
   * The protocol's addresses, for checking the entries against the chain:
   *   0x228148889505f14602458969e36f8546cd0f0354
   *   0xbab0cc82ca758dcfb27bbc030c554c3473959740
   * A third recipient appears beside them on several deployments and is counted
   * here as the pool's side, not the protocol's. Where that is wrong the
   * protocol's share is understated, never the reverse. An empty list means no
   * capture has settled through that distributor yet.
   */
  shares: [number, number][];
}

export interface ChainSettings {
  start: string;
  /**
   * How the pools state a swap. The extended event carries the rate the swap
   * paid; the classic one states it in a SwapFee log beside it.
   */
  swapEvent?: "classic" | "extended";
  /** the deployment's arbitrage executor, whose own legs are not trade the pool won */
  executor?: string;
  distributors?: Distributor[];
  /** plugins that pay liquidity providers inside the swap and never touch a distributor */
  donatingPlugins?: { plain?: string[]; indexedToken?: string[] };
  /**
   * The pools the plugin runs in, each as [pool, token0, token1].
   *
   * They are named rather than discovered, and a pool opened later is counted
   * once it is added here. Discovery would mean reading each plugin factory's
   * whole PluginCreated history on every run, and the public nodes on one of
   * these chains cap a log query at thirty blocks, so it cannot run there at
   * all. The factories the list is generated from, so it can be regenerated
   * and checked against the chain:
   *   base    0xa8dd4c05796801c734e99d5582e90e3a8bd88194, 0xc3f2be91360d9ffc874e35b111780ccfb1a3ebce
   *   flare   0x9caa8f20b7ce0bd2d97f614a473a68ba6140970d
   *   polygon 0xfe2041d7779a28fc6bf39223a952bad0beffd525
   *   soneium 0x672bb0a1ac120cb61ecdc6d2c3aa1e042f0eb941
   *   somnia  0x7b4553a35d3020064cb464a8d75a4735ffda15bd
   * The pairs are named with them so that a day needs no eth_call either: the
   * same nodes serve no archive state.
   */
  pools: [string, string, string][];
}

export const chainConfig: Record<string, ChainSettings> = {
  [CHAIN.BASE]: {
    start: "2026-03-26",
    swapEvent: "extended",
    executor: "0x3a980817e1522c532cc504dba5f5fee9e9096ac5",
    distributors: [
      // the deployment this protocol started with
      { address: "0x53c67db91f47923d26b0b85a345e484e32a6232f", shares: [[42873122, 5000], [46026125, 2500]] },
      { address: "0x10470434b3855016695cf18d456dae86b83e9239", shares: [[47159413, 0], [48050374, 1500]] },
      // pays a single recipient that is not the protocol
      { address: "0xd97d8624ee0be7b6e9b667a455a9d143df559cf3", shares: [[46030693, 0]] },
      // per-pool configs, each the pool creator and the protocol vault at half apiece
      { address: "0x55434f43bfb04839d53a2ca017e40614eb954b80", shares: [[46552099, 5000]] },
      // wired to a live plugin, nothing settled through it yet
      { address: "0x68422147999c2d22b374adc4becdf48fea9fe9cf", shares: [] },
      // wired to a live plugin, nothing settled through it yet
      { address: "0xc4f7a22dd6964aeb23de87bf7ab313538d16b2c2", shares: [] },
    ],
    donatingPlugins: { plain: ["0xfad27bc5ef16a0a2aa3049953c25a48e8858b0c0", "0x1e549354366c480cc298919e014fb95ec0a370c0"] },
    pools: [
      ["0x03122fc0c902d6fe9cf019e16a406eac8efa7fdd", "0x4200000000000000000000000000000000000006", "0xc1cba3fcea344f92d9239c08c0568f6f2f0ee452"],
      ["0x0ba69825c4c033e72309f6ac0bde0023b15cc97c", "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913", "0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf"],
      ["0x0ced1345bf11471cbb0060369fa3a2ea7b653d13", "0x4200000000000000000000000000000000000006", "0x9ccd163a68e56d1079d16b25fbd69d464f657b07"],
      ["0x185d2910cf52ff2a4e33701c3336355cdf996e40", "0x715324e1567bf6c59d917edca0dea2f235a6320f", "0x83f31af747189c2fa9e5deb253200c505eff6ed2"],
      ["0x1b30b28ae62d3103c78841a4dc0849c02c29a069", "0x2878cfc54aabdadd9bb5d70dd24d6b91485afba3", "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913"],
      ["0x34069d40921abc416f1be481e87a3e3a8c4edf66", "0x096746e984e57ae9a2922a08fc969bbe76963a72", "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913"],
      ["0x34fce72ec1fdf3c1286381daf7c0166a7e28e4a3", "0x3ea5fe422379c143a030ca12a82efeb81cedba67", "0xa4ec5895bdcd4b48a86839aaf0a263125eab997d"],
      ["0x389d135a96103a4cfda22a257aa6a15434bd0d71", "0x584fbca587e2bbea9bec6cac60370f6ed20a49c4", "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913"],
      ["0x3a9b6feed79d45f5ddd7eedcc526f7d5a01b60fa", "0xae35ff1bc4fbb45aaeef9768a3d9610786cac98b", "0xd9aaec86b65d86f6a7b5b1b0c42ffa531710b6ca"],
      ["0x3c054e1498857d5c904ff818c876f174a87f1fe0", "0x584fbca587e2bbea9bec6cac60370f6ed20a49c4", "0xcb35efff26f7e812541c6136785ce7617daeb8fa"],
      ["0x3f9b863ef4b295d6ba370215bcca3785fcc44f44", "0x4200000000000000000000000000000000000006", "0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf"],
      ["0x434355f7eafcf3a5b8a6ef755505b845682f906b", "0x236aa50979d5f3de3bd1eeb40e81137f22ab794b", "0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf"],
      ["0x51f0b932855986b0e621c9d4db6eee1f4644d3d2", "0x00000e7efa313f4e11bfff432471ed9423ac6b30", "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913"],
      ["0x5a9ad2bb92b0b3e5c571fdd5125114e04e02be1a", "0x4200000000000000000000000000000000000006", "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913"],
      ["0x60a3054b0877ee617a6b23b602e2e6988bb57e7e", "0x1396aa964c6f8c8c860ce6268a7c9bafb914e753", "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913"],
      ["0x6ee8992c7b9b94ac8a236a6ef185e7abb1490183", "0x24d621b1f5f1cf295313c88dc331012140e52d54", "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913"],
      ["0x74a4bf2cad1b172cdc82a5da7130c7a59eb5460b", "0x2ae3f1ec7f1f5012cfeab0185bfc7aa3cf0dec22", "0x4200000000000000000000000000000000000006"],
      ["0x7a04475ba30e9e0b8f150d8e671bee6d7f6c9dc3", "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913", "0x9ccd163a68e56d1079d16b25fbd69d464f657b07"],
      ["0x7b2b36840a9c74d9c55bf2fdf10ea879f0066a9f", "0x7094c27f342dbadfbbed005b219431595e33b305", "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913"],
      ["0x82dbe18346a8656dbb5e76f74bf3ae279cc16b29", "0x4200000000000000000000000000000000000006", "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913"],
      ["0x855fcfc162d89bb4930c746d01f25d255de5f772", "0x60a3e35cc302bfa44cb288bc5a4f316fdb1adb42", "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913"],
      ["0x89f29dd355d74e57389374a2aa5f9518a1e497ac", "0x00000e7efa313f4e11bfff432471ed9423ac6b30", "0x4200000000000000000000000000000000000006"],
      ["0x8f49706beb729c40846fd1a253b7943a071d79c1", "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913", "0xd89d90d26b48940fa8f58385fe84625d468e057a"],
      ["0x94a34d276ba15bd34538b32b3c6dc38fcb02c51a", "0x7f5c2b379b88499ac2b997db583f8079503f25b9", "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913"],
      ["0x982a372ff0ce223df31217a1c833ec35f1830343", "0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf", "0xfde4c96c8593536e31f229ea8f37b2ada2699bb2"],
      ["0xacc2874ed22e811afdc47979c7b7985cced53b29", "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913", "0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf"],
      ["0xb20f018dde5a6fe7f93c31da05a5da9efbc52772", "0x4200000000000000000000000000000000000006", "0x60a3e35cc302bfa44cb288bc5a4f316fdb1adb42"],
      ["0xbe50cc9cf0905cac4f8f8453bb6c9798898658bd", "0x4200000000000000000000000000000000000006", "0x7094c27f342dbadfbbed005b219431595e33b305"],
      ["0xc07fcce40b3afd2f795a5cb451a3f80737539983", "0x60a3e35cc302bfa44cb288bc5a4f316fdb1adb42", "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913"],
      ["0xc142affc7191aa77ef644a790da10a9aa8b01f7e", "0x0b3e328455c4059eeb9e3f84b5543f74e24e7e1b", "0x4200000000000000000000000000000000000006"],
      ["0xc2557d9fab0b2813188e8f69dd3704a44d42d7be", "0x36785bb0396d3717ae3ddec61a4f562b7fcd9a37", "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913"],
      ["0xd30b9fa98713425c0302593d7f8f094be31e9710", "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913", "0xfde4c96c8593536e31f229ea8f37b2ada2699bb2"],
      ["0xd800b7e8c0949dffbd59e3df9527a22e311c0e7b", "0x4200000000000000000000000000000000000006", "0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf"],
      ["0xe716634679af01f6511df3facf130a130927ee8c", "0x4200000000000000000000000000000000000006", "0x9bba915f036158582c20b51113b925f243a1a1a1"],
      ["0xeb58703922961813c19fa755e83f1396ff9c99b0", "0x236aa50979d5f3de3bd1eeb40e81137f22ab794b", "0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf"],
      ["0xee58348059c9ad6ac345be79c399da0c200627ed", "0x4200000000000000000000000000000000000006", "0xcb585250f852c6c6bf90434ab21a00f02833a4af"],
      ["0xf52fa13e8eaa457aa48229d0617f59d39c4f0be8", "0x4200000000000000000000000000000000000006", "0x920e753d8d7d5b598063c89b6f06288803448d06"],
      ["0xfe4d6560d04fed2c9b6b163cb88979d7cce3874a", "0x60a3e35cc302bfa44cb288bc5a4f316fdb1adb42", "0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf"],
    ],
  },
  [CHAIN.FLARE]: {
    start: "2026-03-26",
    swapEvent: "classic",
    executor: "0xd9eb94fcd47f54f81841e6616e0a2f746556da26",
    distributors: [
      { address: "0x3cf6f6201be435c0527cab7ac6724c56616e0982", shares: [[57255039, 3000], [57255471, 0], [64075166, 1500]] },
    ],
    pools: [
      ["0x019b44755d79df3f75611c1c98a60ceba3632fc0", "0x12e605bc104e93b45e1ad99f9e555f659051c2bb", "0x1d80c49bbbcd1c0911346656b529df9e5c2f783d"],
      ["0x160fd9592585890bbcee2a9dc92a496d0958a17a", "0x12e605bc104e93b45e1ad99f9e555f659051c2bb", "0x4c18ff3c89632c3dd62e796c0afa5c07c4c1b2b3"],
      ["0x19228319d394d871e78e428286418c5df3b9d857", "0x1d80c49bbbcd1c0911346656b529df9e5c2f783d", "0xe7cd86e13ac4309349f30b3435a9d337750fc82d"],
      ["0x1e806f18638e2e89ab42e94a9a619ffec203b84b", "0x1502fa4be69d526124d453619276faccab275d3d", "0xad552a648c74d49e10027ab8a618a3ad4901c5be"],
      ["0x26796ccb9867757cedbd62a5a9e0fa73bec8ca3b", "0x657097cc15fdec9e383db8628b57ea4a763f2ba0", "0xe7cd86e13ac4309349f30b3435a9d337750fc82d"],
      ["0x2a91d9296ee2fe4139b49c7071b2f29f59a9f9ae", "0x4c18ff3c89632c3dd62e796c0afa5c07c4c1b2b3", "0xad552a648c74d49e10027ab8a618a3ad4901c5be"],
      ["0x321621bf87037ff2f6438530b5f0f11c8837ad22", "0x0988c6ba244a90c07a917ebe609eb3264be716ff", "0x657097cc15fdec9e383db8628b57ea4a763f2ba0"],
      ["0x3df8071169743c2de79ec0864fc2d8ed744cb37a", "0x1d80c49bbbcd1c0911346656b529df9e5c2f783d", "0x4c18ff3c89632c3dd62e796c0afa5c07c4c1b2b3"],
      ["0x488d13f980609a38565cc8bddc6987f069c65749", "0x1502fa4be69d526124d453619276faccab275d3d", "0x1d80c49bbbcd1c0911346656b529df9e5c2f783d"],
      ["0x54b971682f4438ebd0c3ff4dcba67fb7e16b9de4", "0x0988c6ba244a90c07a917ebe609eb3264be716ff", "0x1d80c49bbbcd1c0911346656b529df9e5c2f783d"],
      ["0x5cb9513643a02ef838f64302e3e889914ed3445b", "0x1d80c49bbbcd1c0911346656b529df9e5c2f783d", "0x657097cc15fdec9e383db8628b57ea4a763f2ba0"],
      ["0x66050ed5ae1a455faf707b740ec63485cf105153", "0xd8bf1d2720e9ffd01a2f9a2efc3e101a05b852b4", "0xfbda5f676cb37624f28265a144a48b0d6e87d3b6"],
      ["0x79af232ae7ccd460439af3515022c10f5509d9f8", "0x1502fa4be69d526124d453619276faccab275d3d", "0x26a1fab310bd080542dc864647d05985360b16a5"],
      ["0x927485d88a66253c63af9163dca5f21c25a57393", "0xad552a648c74d49e10027ab8a618a3ad4901c5be", "0xe7cd86e13ac4309349f30b3435a9d337750fc82d"],
      ["0x9f6c46f190351275e47d7ad8d3f2c9487569211e", "0x1d80c49bbbcd1c0911346656b529df9e5c2f783d", "0xad552a648c74d49e10027ab8a618a3ad4901c5be"],
      ["0xbfe5eafd86cf270cf0ecca07f4fd0de67ee8bcfb", "0x1502fa4be69d526124d453619276faccab275d3d", "0xe7cd86e13ac4309349f30b3435a9d337750fc82d"],
      ["0xc39659c230b5420b571c40457c73acf4b8939aac", "0x12e605bc104e93b45e1ad99f9e555f659051c2bb", "0xad552a648c74d49e10027ab8a618a3ad4901c5be"],
      ["0xdcea6d3d7ca3b67c02d2b242a9037f8afe613c27", "0xe7cd86e13ac4309349f30b3435a9d337750fc82d", "0xfbda5f676cb37624f28265a144a48b0d6e87d3b6"],
      ["0xea17e8634ce3a1dcea776df65b740772d43576a5", "0x12e605bc104e93b45e1ad99f9e555f659051c2bb", "0xd8bf1d2720e9ffd01a2f9a2efc3e101a05b852b4"],
    ],
  },
  [CHAIN.POLYGON]: {
    start: "2026-06-10",
    swapEvent: "classic",
    executor: "0x6f680f333380e422d1d1071196af51a455946e35",
    distributors: [
      // its one announcement, at block 88,310,962, names a single recipient
      // and it is not the protocol's
      { address: "0xd4e31c8708d59dac665858dcc542329c15ed79a3", shares: [[88310962, 0]] },
      // wired to a live plugin, nothing settled through it yet
      { address: "0xd5a24b95db6a80322ea1cb6d457ecc0d129ec73b", shares: [] },
    ],
    pools: [
      ["0x0073b2cf64928a73d94ed6639ffbce0ceb29a9b1", "0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270", "0x53c77e37a39c063dfa8651a558a79619c63524bd"],
      ["0x031465c5030977f9577584e750775ce2a21e2213", "0x3c499c542cef5e3811e1192ce70d8cc03d5c3359", "0x40a5b6db4fddbd8caffa4fff99e4044d79430ca5"],
      ["0x04abc99bab7bf734a6dee60e6167443c6d34edb4", "0x0db4e38d0300e1e5cfc19b5a4575d6dfa7d7dafb", "0xb5c064f955d8e7f38fe0460c556a72987494ee17"],
      ["0x07844dd085f73090306123b72167c7d3cef44dac", "0x3c499c542cef5e3811e1192ce70d8cc03d5c3359", "0x7fe088a1d3edf600727d23a8451dc2bec8c133e4"],
      ["0x0858af6ce39e2c3969bf3f42771c8b86f7742d5a", "0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270", "0x53e0bca35ec356bd5dddfebbd1fc0fd03fabad39"],
      ["0x08be0ca32fa09cc3abc7f83cff2fffdca2713d9e", "0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270", "0xa28ab9e6d0c8009709be0ca5449e8b091b27b828"],
      ["0x0aaca25c94d45d9dd4503ad0b8597f1e8a5ac0d6", "0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270", "0x8f3cf7ad23cd3cadbd9735aff958023239c6a063"],
      ["0x0c159c9417c17d7c786876e6a3620000e89527de", "0x8f3cf7ad23cd3cadbd9735aff958023239c6a063", "0xc2132d05d31c914a87c6611c10748aeb04b58e8f"],
      ["0x0c7d69625d5b6cf63eb28a8774da5312963bfc58", "0x98965474ecbec2f532f1f780ee37b0b05f77ca55", "0xc2132d05d31c914a87c6611c10748aeb04b58e8f"],
      ["0x0e18c6fa2fd6eb48b9e9be0d6df93a861b40895c", "0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270", "0xd8a28224358b4291cd09710969ececcafbdb2751"],
      ["0x0f11035084aee85ee91b9d319d2f697885e909d8", "0x3c499c542cef5e3811e1192ce70d8cc03d5c3359", "0x8f3cf7ad23cd3cadbd9735aff958023239c6a063"],
      ["0x107de47791cab115d723c85aec4b8503664efa98", "0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270", "0x2791bca1f2de4661ed88a30c99a7a9449aa84174"],
      ["0x176f13b0bb32157a612eda21d8b711cd2261b080", "0x3c499c542cef5e3811e1192ce70d8cc03d5c3359", "0xb5c064f955d8e7f38fe0460c556a72987494ee17"],
      ["0x19424014b8f3b0ba729b0fcd7f21ec5837126dad", "0x0db4e38d0300e1e5cfc19b5a4575d6dfa7d7dafb", "0x1bfd67037b42cf73acf2047067bd4f2c47d9bfd6"],
      ["0x1a2e3edd97679fa2e17aa552a4551d70581d116a", "0x8f3cf7ad23cd3cadbd9735aff958023239c6a063", "0xeb51d9a39ad5eef215dc0bf39a8821ff804a0f01"],
      ["0x1a6289354fcecbf4d19ecd7f21c0c1ce7f2fdd40", "0x53e0bca35ec356bd5dddfebbd1fc0fd03fabad39", "0x7ceb23fd6bc0add59e62ac25578270cff1b9f619"],
      ["0x1ba23dc4b7d1c6774d37ee64907dce60a21b625c", "0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270", "0xe960d5076cd3169c343ee287a2c3380a222e5839"],
      ["0x1c6c801095b6b82f3e6e2e377f753ecd21632ade", "0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270", "0xe01ae5e7bbdf5a01ceddbca47703bbcdb0d797ec"],
      ["0x1e0dffff4a538aee577d7e819b8a0547c1df4643", "0x8f3cf7ad23cd3cadbd9735aff958023239c6a063", "0x99a57e6c8558bc6689f894e068733adf83c19725"],
      ["0x1e46710d473608e4dfcd312173c2594c48f307cf", "0xc2132d05d31c914a87c6611c10748aeb04b58e8f", "0xc86bde5a6119de084d36c5018012a252d11d5bed"],
      ["0x1ee1af58cf6da3d257961b517d47152e0e827fef", "0x465c4eace8ef06a4308db2e6cce5d6f99bbb21dc", "0xe4bf2864ebec7b7fdf6eeca9bacae7cdfdaffe78"],
      ["0x20a49b642afc60a5cf4e38317ceb8dd616473642", "0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270", "0x478c45c6a19e68dc75d73176ee6b67c3f5b539fb"],
      ["0x2181ac78799af6037ef9dab479dfeb9061252699", "0x1c037a9fca50668b828905c954cabcbcf89a74d3", "0x3c499c542cef5e3811e1192ce70d8cc03d5c3359"],
      ["0x2409ef08523d1bf97d55a66def751f7e747ee82a", "0x3c499c542cef5e3811e1192ce70d8cc03d5c3359", "0xd13dfc127036e0d3dad19e92676d419f241e4914"],
      ["0x252c3c115bfd375c34d791752442488e436c4b09", "0x8ce47dc72f3a766e0bbf670fdada74a5c730b78b", "0xf083af777856148130eab500223d5fbc21338986"],
      ["0x25dcc15b2d49aca1040c1ab55313967d8e9308d6", "0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270", "0xac199aa3681f13a746b35345fdb62de33ad309a6"],
      ["0x28d11117d95f60dd1210d1af10828e8be6ff1be6", "0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270", "0xea6b78aa3cadd0ffefff36c4b3fd63879b3158ed"],
      ["0x2a2c0dc20086a55633ef843a81fbb975fb3aaea2", "0x3c499c542cef5e3811e1192ce70d8cc03d5c3359", "0x4175272a09a8b2669bac8e1c69853352fc11500e"],
      ["0x2c65517e1a64e9af16685ac365d9c71751ae9c8b", "0x3c499c542cef5e3811e1192ce70d8cc03d5c3359", "0x465c4eace8ef06a4308db2e6cce5d6f99bbb21dc"],
      ["0x2e5f01dd6cf4ab4743738326cb013b6874a48d5e", "0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270", "0xc0336e2b22644a48cc24910b42614c2843ad8929"],
      ["0x33332ad9c23e840513def94bc3a69eb220428ddc", "0x3c499c542cef5e3811e1192ce70d8cc03d5c3359", "0x486198756a30d6d3d6781dffc66c4379e259cb6a"],
      ["0x3406485d1ae85fea6969fda60adff11efb2c9734", "0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270", "0x31b7bf61b7018fbd4dd6f62c15cd8a7dd6b0f4ca"],
      ["0x3c5eb90b1a9c4ed87709acb5bf5b8e6455547ac5", "0x1bfd67037b42cf73acf2047067bd4f2c47d9bfd6", "0x7ceb23fd6bc0add59e62ac25578270cff1b9f619"],
      ["0x3e411aa4814808277c7ba5667db66ad7ced4a37e", "0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270", "0xb5c064f955d8e7f38fe0460c556a72987494ee17"],
      ["0x3f7efefa166a78ce8cb9e2cd385b6ad169ea0bf7", "0xc2132d05d31c914a87c6611c10748aeb04b58e8f", "0xdcd768d325a0bc99cb48fb3bf54578c9ecbd7b62"],
      ["0x4304f2ef0e999028c4ba25422b07aead283372cf", "0xc2132d05d31c914a87c6611c10748aeb04b58e8f", "0xe9681e6eb29023da1d3f2c10b56adbe3128e344b"],
      ["0x455aab32887c2143b5548decd4698d91991fef12", "0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270", "0x7d1fb397cf7508528fcb6895e48d6d1d94f53e32"],
      ["0x463d1a0b0a6f773e03715f5054d38d25e4a0c7e9", "0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270", "0xf2d67c63308466de87ed35c51d1d69eb397eb9c1"],
      ["0x471c915f0af74925c12506891171045d8f051265", "0x21483a7870b9121872aedeb5a74189f1fd96b8b8", "0x3c499c542cef5e3811e1192ce70d8cc03d5c3359"],
      ["0x48740a01a8c8ddf3529a6537307c0c6a72314b72", "0x465c4eace8ef06a4308db2e6cce5d6f99bbb21dc", "0xb33eaad8d922b1083446dc23f610c2567fb5180f"],
      ["0x4902155f0db0a16194f25a75a280eecf406f4859", "0x3c499c542cef5e3811e1192ce70d8cc03d5c3359", "0xc2132d05d31c914a87c6611c10748aeb04b58e8f"],
      ["0x4d62fca4e5c7bd0df523f9cb3842e0cc84a068e9", "0xc2132d05d31c914a87c6611c10748aeb04b58e8f", "0xfe302b8666539d5046cd9aa0707bb327f5f94c22"],
      ["0x4f793040cdc7a3d828caf56deb5bb225f83c9034", "0x465c4eace8ef06a4308db2e6cce5d6f99bbb21dc", "0xb5c064f955d8e7f38fe0460c556a72987494ee17"],
      ["0x4f7b3bc3251a42bd3e952ceb63ce47dc26163414", "0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270", "0xc2132d05d31c914a87c6611c10748aeb04b58e8f"],
      ["0x549327f3ede8f17a0a7a1d72fce02049dca115ca", "0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270", "0x368d929a7502fb8b590a501ae0e3f9a0fe02ecb1"],
      ["0x5fae79bfe01f3cf3d24da56ba58e73056ca6e747", "0x7ceb23fd6bc0add59e62ac25578270cff1b9f619", "0xb5c064f955d8e7f38fe0460c556a72987494ee17"],
      ["0x624f9417f1bfe97b1eb3dc32637e8e3b8ec3101b", "0x2791bca1f2de4661ed88a30c99a7a9449aa84174", "0xc2132d05d31c914a87c6611c10748aeb04b58e8f"],
      ["0x670ab6e8962f975d0c8ee65a804f72bb252caf9c", "0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270", "0xbaf280b74c264a911b41341a26508eac9e74fd4f"],
      ["0x6844cdeed0f67916b925a9d098708a02feeae0e7", "0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270", "0xdcd768d325a0bc99cb48fb3bf54578c9ecbd7b62"],
      ["0x687d448072b34675043bbd10d508d2d4160d5bd6", "0x2791bca1f2de4661ed88a30c99a7a9449aa84174", "0x8f3cf7ad23cd3cadbd9735aff958023239c6a063"],
      ["0x6bc8da680213dba494b7f0ce3117f118ad7c8849", "0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270", "0x8f0bb8a901ee0f385301d32e8693851be60c155a"],
      ["0x6cc69b7897f1c52a457c0f73d357a335f4949d96", "0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270", "0x3717440d1a70eb60621a9661c663f570ae333ae1"],
      ["0x6eb0df4b56b8c5dcbebfe55de5840fbe983faa0a", "0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270", "0x15f587be0b5d21f08177fd304c122bc93dabf7f1"],
      ["0x6fc7f804153bec833d4a5c6dbc8308c76436cd4e", "0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270", "0x959da7735a00d96f028a3518952966c9b2e93bac"],
      ["0x70822031afef06632b8c8c29abd581309f59f434", "0x86e5db6e478be7d7ac8c9348612d1e1c1bbe6534", "0xc2132d05d31c914a87c6611c10748aeb04b58e8f"],
      ["0x7121f2d1407978e87818da1bf3d239bc11dd1107", "0x465c4eace8ef06a4308db2e6cce5d6f99bbb21dc", "0x7ceb23fd6bc0add59e62ac25578270cff1b9f619"],
      ["0x71f8942c00ac69c69f75fef4ab569297bae4a88d", "0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270", "0x701100d19b1a93672cfe7291ea455b4220631209"],
      ["0x752a601bacfed0f501d97d365906429edb5efbb1", "0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270", "0x10fc550d91fd94568adf0a19046e76713999f8c6"],
      ["0x77a555e3e989d9585fd7192080e7d67ec871ba75", "0x771418b52067c9e6f2e83c582b37c63d2f1b5eef", "0xc2132d05d31c914a87c6611c10748aeb04b58e8f"],
      ["0x78c3e74eb5a798ccbbaef7a3b5fa05a7e731b5a9", "0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270", "0x1a2281c59867815f87385e8ede11196654740ae9"],
      ["0x7a6e66a49643c5b039584d4f66127e8f3bb2dbaf", "0x3c499c542cef5e3811e1192ce70d8cc03d5c3359", "0x9d4de140dca190a1298a87edf629931e14f31371"],
      ["0x7cd664769370fb13f3b627e93b120e5099502bc1", "0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270", "0x4a0105051b938707dd1442e0dbd425ae9ac0eacd"],
      ["0x7e8e6c28c28038b84cb4d1961a94d0da12f70f86", "0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270", "0x34d8bbfd713c3a97f94105a093bb6a955c5399d8"],
      ["0x7f1aee1413c6c4ccae5e306c3a4210b1028f0911", "0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270", "0x24741ec60f7792268e6991024cf4f3876186aa65"],
      ["0x7f5a1e5dab800a27cc6e39c6e45ce122fa01b2a3", "0x0fe0648ec6186ae25a69885cb1d8ca1b2cc9c740", "0xc2132d05d31c914a87c6611c10748aeb04b58e8f"],
      ["0x7f70bbf10288d6106b20f6485ee5538b71e09f24", "0x53c77e37a39c063dfa8651a558a79619c63524bd", "0xc2132d05d31c914a87c6611c10748aeb04b58e8f"],
      ["0x7fdce40eb1025d3767626d1c4f3ad3607e65eb6e", "0x0b3b5b13fa312c0db1d6387241d7fc2c358ecec2", "0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270"],
      ["0x815ff2536ce2bb623160ea0a80f1294c5f9add55", "0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270", "0xde5916b2e6e27ee811813eb65993dc9873f88b7b"],
      ["0x823acc959be11cbefeec014dbfbc814cc0b226d5", "0xb5c064f955d8e7f38fe0460c556a72987494ee17", "0xe9681e6eb29023da1d3f2c10b56adbe3128e344b"],
      ["0x870dffb804ef241f35032754cc2b81169d2fb33a", "0x1bfd67037b42cf73acf2047067bd4f2c47d9bfd6", "0x3c499c542cef5e3811e1192ce70d8cc03d5c3359"],
      ["0x885316a4e7b442a2978d418fb04d7143c25c527d", "0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270", "0xf407f59180ac15d9342b91211b406470131bd7fc"],
      ["0x887527d64994e7816b7383752af95d1d6ce4e389", "0x2278485e81b735e0f79fdca936f901d0727e6603", "0xc2132d05d31c914a87c6611c10748aeb04b58e8f"],
      ["0x88e89e652be3b03b1447af2001e742ed9bdcf152", "0xc2132d05d31c914a87c6611c10748aeb04b58e8f", "0xeb51d9a39ad5eef215dc0bf39a8821ff804a0f01"],
      ["0x8ef0ef28f36ed500b2bbeb0a7b18496eaef6342e", "0x3c499c542cef5e3811e1192ce70d8cc03d5c3359", "0x53c77e37a39c063dfa8651a558a79619c63524bd"],
      ["0x90457d978f080cda2acefffc7a30cea496761ef9", "0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270", "0xccf2c43daf898fb1e367f1af7c3b31528361f67f"],
      ["0x91bcfbc1aafe3f0f5e837d6532bb670f37a80a1f", "0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270", "0x657217af95bc1db9137edc6fb75d57ce9c12b2ce"],
      ["0x93597fb78dcdb09b7e0061deff3cc1aa3ceb89f1", "0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270", "0x2da64b4b17d2edd98ae39cbeec808df28390c39d"],
      ["0x960c6dc8b3497a28a9d5dd8f3d08d9dc39d4d54d", "0x0bdcb45d4d28f86b3904e34e7dc7065bc3a927b3", "0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270"],
      ["0x9806b51c8e6b21c3ae593dfefc3c742d8ade675e", "0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270", "0x2e6576c64b27aed687556a4ef39b1547534429ad"],
      ["0x989b0d542648c96950e6a84d7638c0a1e5d57d63", "0x2791bca1f2de4661ed88a30c99a7a9449aa84174", "0x7ceb23fd6bc0add59e62ac25578270cff1b9f619"],
      ["0x99da92949c86a68f7c6abc097cfb4681368a1bd1", "0x3c499c542cef5e3811e1192ce70d8cc03d5c3359", "0x7ceb23fd6bc0add59e62ac25578270cff1b9f619"],
      ["0x9a00fb6e519b5c4b0ccfe040c9bf14d2ea776d99", "0x3c499c542cef5e3811e1192ce70d8cc03d5c3359", "0x5f1600e7adc3589a7d06d704f62bbe8fbc15cf20"],
      ["0x9c91019c3349df71ebc88ed5b54a67d9c818f812", "0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270", "0x36d061977c76c4ff43abe0cbc91aae0b1fb9cfc9"],
      ["0x9d35f6d579c90601b92d268cbd6ea1e0f4569d70", "0x3c499c542cef5e3811e1192ce70d8cc03d5c3359", "0x53e0bca35ec356bd5dddfebbd1fc0fd03fabad39"],
      ["0xa0ae9c3ce70fc22307a502a98651ff59528ce165", "0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270", "0xe9681e6eb29023da1d3f2c10b56adbe3128e344b"],
      ["0xa2b25d6869b9da463d347dc88ef855eeda29aad4", "0x0244b8d1b92e25179ef30e7c2b797f0cf971326a", "0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270"],
      ["0xa578e940c66db325dec06abfd3b71e4ba7b02ffe", "0x99a57e6c8558bc6689f894e068733adf83c19725", "0xeb51d9a39ad5eef215dc0bf39a8821ff804a0f01"],
      ["0xa606e0a8732f7e08bb5f1aac9c2dc52889a43af9", "0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270", "0x36a152253aa64a619dcc801fb2589db4bacf37d9"],
      ["0xa9faf535baa2a48cdf7f441cd14ff168dbbf2e10", "0x3c499c542cef5e3811e1192ce70d8cc03d5c3359", "0xe1fe9d80347f4b4cee3fc503cc11bbf2c3ebc3b0"],
      ["0xaad26e5524ab0319cf978d80c8dfb01a2f1a3f17", "0x36a28c7c9b3dea22f07f4df67833cbe764feeeb4", "0x465c4eace8ef06a4308db2e6cce5d6f99bbb21dc"],
      ["0xaff58fb161057b3d26fd0a2318b1adc845fce106", "0x21483a7870b9121872aedeb5a74189f1fd96b8b8", "0xc2132d05d31c914a87c6611c10748aeb04b58e8f"],
      ["0xb05b679cffa69b0fff5119a1b9f740c223e52c5b", "0xc2132d05d31c914a87c6611c10748aeb04b58e8f", "0xe8e9961471c28fabd9c0f2161556e440041c8888"],
      ["0xb2492c76b9aa8be63533b7400cb26cc6ee8bc47d", "0x3c499c542cef5e3811e1192ce70d8cc03d5c3359", "0x5169ba84e533f5c1811bcf677cfecedab6161b5a"],
      ["0xb2eea6981e16a7514f051b1ccdb157d2574b5e7d", "0xc2132d05d31c914a87c6611c10748aeb04b58e8f", "0xf6924b07160637e17846941491544fa8fe3c6aeb"],
      ["0xb3fa2feb8eb215562b3a98a7eeca4a79ecf37dfc", "0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270", "0x3c499c542cef5e3811e1192ce70d8cc03d5c3359"],
      ["0xba5fe3a8d0af369dc87385522573dee11dd7aadd", "0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270", "0x30df99e86d26e85cacb596275ed782f2cb861885"],
      ["0xbb5a687e6f0ce2d3a4bfcfee40efa29ba4810ed5", "0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270", "0x0db4e38d0300e1e5cfc19b5a4575d6dfa7d7dafb"],
      ["0xbda3e22778eaa10b856c250ffd09c345576c49a5", "0x55ca8078e32733d8603f07678e8a6474f7ff62d0", "0xc2132d05d31c914a87c6611c10748aeb04b58e8f"],
      ["0xbfc45f612f5be49f13668137f39d6878bbac04fa", "0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270", "0xbc14fc048ff04152a43934a1381db9b8db36d79c"],
      ["0xc098a7d444ebd66d17cad5f10bc2427b472fba9a", "0x0566c506477cd2d8df4e0123512dbc344bd9d111", "0x465c4eace8ef06a4308db2e6cce5d6f99bbb21dc"],
      ["0xc381c8b79ad5ab827103f06b35d237c82c7cc585", "0x0392db6d95fc6e367cd30c7bb809090b4424b032", "0x3c499c542cef5e3811e1192ce70d8cc03d5c3359"],
      ["0xc714155afd3e3049a47674e1c6d1f2dce03a2cd2", "0x2791bca1f2de4661ed88a30c99a7a9449aa84174", "0x3c499c542cef5e3811e1192ce70d8cc03d5c3359"],
      ["0xcfedf878a499bcf36ca40b4f0084894541b574cf", "0x0db4e38d0300e1e5cfc19b5a4575d6dfa7d7dafb", "0xe9681e6eb29023da1d3f2c10b56adbe3128e344b"],
      ["0xd050fc88e4c70028023f0366f04a4cf49937cef2", "0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270", "0xb8de4c6aa220600a3033f914d336288be7fd8386"],
      ["0xd61e712102faaa8a78973355a8e948d6e4d48ded", "0x3c499c542cef5e3811e1192ce70d8cc03d5c3359", "0xc2e0fdc9da4c3863c3834c9e4c42990e6644c50c"],
      ["0xd77a4a331fb80d3bc76dcc9ae5ac5a86b4219aa4", "0x97f95fd73f7fbf89c1d5d217c0b0d0c56ba74c6f", "0xc2132d05d31c914a87c6611c10748aeb04b58e8f"],
      ["0xd85715662a320b296509a754541b223b830bd12f", "0x7ceb23fd6bc0add59e62ac25578270cff1b9f619", "0xc2132d05d31c914a87c6611c10748aeb04b58e8f"],
      ["0xd9e3609687743772837528a990c530a1b9b3646c", "0x046e6d611939596dd2a26230f8b46e82da233be2", "0xc2132d05d31c914a87c6611c10748aeb04b58e8f"],
      ["0xe2b4211eef0defc75776492adc4e5c9bd8745752", "0xc2132d05d31c914a87c6611c10748aeb04b58e8f", "0xd492d6f18e78b9d20a794a68aa1703741b8a37e3"],
      ["0xe940e272174168b77deab9311e9c78a5924c8381", "0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270", "0xaf8ec65f852886798aceddda7b25bb4e20675b9a"],
      ["0xeabfed942cddabab020685f84c4118a646b7b9ca", "0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270", "0x7ceb23fd6bc0add59e62ac25578270cff1b9f619"],
      ["0xec8a1beb3bab7bc33a3884d8d4bcf57de551a392", "0x0ffd960881c83cd63a50d5c944c9f2b866f55a28", "0x8f3cf7ad23cd3cadbd9735aff958023239c6a063"],
      ["0xec98e3d1c9df7a7bfc10a4d74bc227d695ce68d5", "0x465c4eace8ef06a4308db2e6cce5d6f99bbb21dc", "0x50c40e03552a42fbe41b2507d522f56d7325d1f2"],
      ["0xedfa80bf92371be63bb79943f156be194c54b44f", "0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270", "0x60edb815e19e3270e027be1ac6f9917297a21497"],
      ["0xf03489905470b9b592ff0d53b250e0db1a5e4ac2", "0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270", "0xe3cb87ad46e33302adae44404e8b05418302e5d0"],
      ["0xf7fa2ba77c240d77a235f116667722d4eda0b564", "0xb5c064f955d8e7f38fe0460c556a72987494ee17", "0xc2132d05d31c914a87c6611c10748aeb04b58e8f"],
      ["0xf95bb531c861a67c7968573416d387efb70c8345", "0x85f335926b9004ee9a9c02c77a87f1ea7902a495", "0xc2132d05d31c914a87c6611c10748aeb04b58e8f"],
    ],
  },
  [CHAIN.SONEIUM]: {
    start: "2026-05-25",
    swapEvent: "extended",
    executor: "0x1f915fb5fb52bd32ae54d2b98009e12615605614",
    distributors: [
      { address: "0xab2ee1b9fce05a30e945d46477b96e9adcbb6766", shares: [[23329267, 0], [24877737, 1500]] },
    ],
    pools: [
      ["0x4e13c7fd28fe96fa5992e7df7d882358629de03a", "0x4200000000000000000000000000000000000006", "0xba9986d2381edf1da03b0b9c1f8b00dc4aacc369"],
      ["0x88deb61d597bf26b643293570f5952e2adc01157", "0x0555e30da8f98308edb960aa94c0db47230d2b9c", "0x4200000000000000000000000000000000000006"],
      ["0xd8b3fbc6ab2bfab6e31a770643e40451050e9ce4", "0x13a82039af463ae967b105e4961e1a121fe543f3", "0x4200000000000000000000000000000000000006"],
      ["0xeaae7128976870fc43545c09685fc14706bfb87d", "0x2cae934a1e84f693fbb78ca5ed3b0a6893259441", "0xcb46843fe775eec8499ccf18fb48b915a3dae207"],
    ],
  },
  [CHAIN.SOMNIA]: {
    start: "2026-05-25",
    swapEvent: "classic",
    executor: "0x1f915fb5fb52bd32ae54d2b98009e12615605614",
    distributors: [
      // Not transcribed, and not a verified zero: this chain's only working
      // public node caps a log query at a thousand blocks, its explorer does
      // not carry the address, and the announcement sits somewhere in the eight
      // million blocks between the distributor's deployment and its first
      // capture. Nothing here is counted as revenue until it can be read. The
      // deployment has distributed $3.65 in total since May, so what is at
      // stake is cents, and they are left out rather than assumed.
      { address: "0xab2ee1b9fce05a30e945d46477b96e9adcbb6766", shares: [] },
    ],
    pools: [
      ["0xe5467be8b8db6b074904134e8c1a581f5565e2c3", "0x046ede9564a72571df6f5e44d0405360c0f4dcab", "0x28bec7e30e6faee657a03e19bf1128aad7632a00"],
    ],
  },
  [CHAIN.ROBINHOOD]: {
    start: "2026-09-22",
    distributors: [
      // wired to a live plugin, nothing settled through it yet
      { address: "0xedc0e156afd811c81cf58ac08cb1f986786d3a37", shares: [] },
      // wired to a live plugin, nothing settled through it yet
      { address: "0xd478c8a11803ae872f8394440d66cec556fdaddd", shares: [] },
    ],
    donatingPlugins: { plain: ["0xa258ae996e8c887f5cbe1e0616d864eaa60c70c0"], indexedToken: ["0x7da09e3884e3041ad483053552ecc58e9b0b7454"] },
    pools: [],
  },
};

/** `adapter` for a SimpleAdapter: the chains it runs on and when each starts. */


const swapClassicAbi =
  "event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 price, uint128 liquidity, int24 tick)";
const swapExtendedAbi =
  "event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 price, uint128 liquidity, int24 tick, uint24 overrideFee, uint24 pluginFee)";
const swapFeeAbi = "event SwapFee(address indexed sender, uint24 overrideFee, uint24 pluginFee)";

// The fee fields of the Swap and SwapFee events are millionths: an Algebra
// pool states its rate in hundredths of a basis point, so 3000 is 0.3%.
const FEE_DENOMINATOR = 1000000n;
// SHARE_DENOMINATOR on the distributor, whose share config weights the
// recipients of a capture out of 10,000.
const SHARE_DENOMINATOR = 10000n;

/** The protocol's weight for a capture, as it stood in the block it happened. */
export function protocolShareBps(chain: string, distributor: string, block: number): bigint {
  const entry = chainConfig[chain]?.distributors?.find((d) => d.address === distributor.toLowerCase());
  let bps = 0n;
  for (const [from, value] of entry?.shares ?? []) {
    if (from > block) break;
    bps = BigInt(value);
  }
  return bps;
}

export const shareOf = (amount: bigint, bps: bigint) => (amount * bps) / SHARE_DENOMINATOR;

export interface SwapTotals {
  /** volume, by token, excluding the plugin's own arbitrage legs */
  volume: Record<string, bigint>;
  /** what the trader paid in fee, by token, on the side the pool received */
  fees: Record<string, bigint>;
}

/**
 * One pass over a day of swaps, pool by pool.
 *
 * Where the pools speak the classic event the rate comes from its own SwapFee
 * log, and a swap is paired with the last rate stated before it in the same
 * transaction, by log index. That is what makes a transaction swapping the same
 * pool twice come out right, and it does not depend on the order the node
 * happens to return logs in.
 *
 * The plugin's own arbitrage legs are excluded from both figures, by their
 * sender. They are not trade the pool won, the plugin prices them at a
 * millionth of a percent, and counting them would report the protocol's own
 * round trips as somebody's volume.
 */
export async function collectSwaps(options: FetchOptions): Promise<SwapTotals> {
  const settings = chainConfig[options.chain];
  const volume: Record<string, bigint> = {};
  const fees: Record<string, bigint> = {};
  if (!settings?.pools.length) return { volume, fees };

  const executor = settings.executor?.toLowerCase();
  const extended = settings.swapEvent === "extended";
  const logOptions = { entireLog: true, parseLog: true };
  const add = (bag: Record<string, bigint>, token: string, amount: bigint) => {
    if (amount <= 0n) return;
    bag[token] = (bag[token] ?? 0n) + amount;
  };
  const big = (v: any) => BigInt(v.toString());

  /**
   * The rates a classic-shape pool states beside its swaps, keyed by pool and
   * transaction and ordered by log index. Only the configured pools are asked,
   * never the chain at large.
   */
  const stated: Record<string, { logIndex: number; rate: bigint }[]> = {};
  if (!extended) {
    const feeLogs = await options.getLogs({
      targets: settings.pools.map(([pool]) => pool),
      eventAbi: swapFeeAbi,
      ...logOptions,
    });
    for (const log of feeLogs) {
      const pool = String(log.address).toLowerCase();
      (stated[`${pool}|${log.transactionHash}`] ??= []).push({
        logIndex: Number(log.logIndex),
        rate: big(log.args.overrideFee) + big(log.args.pluginFee),
      });
    }
    for (const list of Object.values(stated)) list.sort((a, b) => a.logIndex - b.logIndex);
  }

  for (const [pool, token0, token1] of settings.pools) {
    const swaps = await options.getLogs({
      target: pool,
      eventAbi: extended ? swapExtendedAbi : swapClassicAbi,
      ...logOptions,
    });

    for (const log of swaps) {
      if (executor && String(log.args.sender).toLowerCase() === executor) continue;
      const amount0 = big(log.args.amount0);
      const amount1 = big(log.args.amount1);
      add(volume, token0, amount0 < 0n ? -amount0 : amount0);

      let rate = 0n;
      if (extended) {
        rate = big(log.args.overrideFee) + big(log.args.pluginFee);
      } else {
        const index = Number(log.logIndex);
        for (const entry of stated[`${pool}|${log.transactionHash}`] ?? []) {
          if (entry.logIndex > index) break;
          rate = entry.rate;
        }
      }
      if (rate <= 0n) continue;

      // the fee is paid on whichever side the pool received
      const [token, input] = amount0 > 0n ? [token0, amount0] : [token1, amount1];
      if (input > 0n) add(fees, token, (input * rate) / FEE_DENOMINATOR);
    }
  }

  return { volume, fees };
}
