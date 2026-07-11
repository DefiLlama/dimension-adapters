import { CHAIN } from "../../helpers/chains";

// Relay (relay.link) cross-chain intent bridge. Users deposit funds into the
// RelayDepository on the origin chain; a solver fills on the destination chain.
// Bridge volume = value deposited, read from the depository's deposit events.
// Same CREATE2 address on every Relay chain.
const RELAY_DEPOSITORY = "0x4cd00e387622c35bddb9b4c962c136462338bc31";
const NATIVE_DEPOSIT = "0x8032066556caf3967d8fec4ad22a2d9e1e9576556b2903a0fcd5b1fd201e3477"; // RelayNativeDeposit(address,uint256,bytes32)
const ERC20_DEPOSIT = "0x49fed1d0b752ce30eee63c7a81133f3363b532fec5d4d7dd1ccfd005de4555e1"; // RelayErc20Deposit(address,address,uint256,bytes32)

const chainConfig: Record<string, { duneName: string; start: string }> = {
  [CHAIN.BASE]: { duneName: "base", start: "2025-06-30" },
  [CHAIN.POLYGON]: { duneName: "polygon", start: "2025-07-10" },
  [CHAIN.ETHEREUM]: { duneName: "ethereum", start: "2025-07-09" },
  [CHAIN.BSC]: { duneName: "bnb", start: "2025-07-09" },
  [CHAIN.ARBITRUM]: { duneName: "arbitrum", start: "2025-06-30" },
  [CHAIN.OPTIMISM]: { duneName: "optimism", start: "2025-07-10" },
  [CHAIN.ABSTRACT]: { duneName: "abstract", start: "2025-07-10" },
  [CHAIN.ROBINHOOD]: { duneName: "robinhood", start: "2026-05-28" },
  [CHAIN.HYPERLIQUID]: { duneName: "hyperevm", start: "2025-07-11" },
  [CHAIN.INK]: { duneName: "ink", start: "2025-07-09" },
  [CHAIN.AVAX]: { duneName: "avalanche_c", start: "2025-07-10" },
  [CHAIN.ERA]: { duneName: "zksync", start: "2025-07-11" },
  [CHAIN.APECHAIN]: { duneName: "apechain", start: "2025-07-23" },
  [CHAIN.MONAD]: { duneName: "monad", start: "2025-11-11" },
  [CHAIN.SCROLL]: { duneName: "scroll", start: "2025-07-11" },
  [CHAIN.MEGAETH]: { duneName: "megaeth", start: "2026-01-08" },
  [CHAIN.UNICHAIN]: { duneName: "unichain", start: "2025-07-10" },
  [CHAIN.RONIN]: { duneName: "ronin", start: "2025-07-11" },
  [CHAIN.ZORA]: { duneName: "zora", start: "2025-07-11" },
  [CHAIN.KATANA]: { duneName: "katana", start: "2025-07-23" },
  [CHAIN.XDAI]: { duneName: "gnosis", start: "2025-07-10" },
  [CHAIN.SOMNIA]: { duneName: "somnia", start: "2025-09-15" },
  [CHAIN.ARBITRUM_NOVA]: { duneName: "nova", start: "2025-07-09" },
  [CHAIN.SHAPE]: { duneName: "shape", start: "2025-07-23" },
  [CHAIN.PLUME]: { duneName: "plume", start: "2025-07-11" },
  [CHAIN.BERACHAIN]: { duneName: "berachain", start: "2025-07-11" },
  [CHAIN.WC]: { duneName: "worldchain", start: "2025-07-11" },
  [CHAIN.TEMPO]: { duneName: "tempo", start: "2026-02-02" },
  [CHAIN.BOB]: { duneName: "bob", start: "2025-07-23" },
  [CHAIN.CELO]: { duneName: "celo", start: "2025-07-23" },
  [CHAIN.SONIC]: { duneName: "sonic", start: "2025-07-22" },
  [CHAIN.PLASMA]: { duneName: "plasma", start: "2025-09-25" },
  [CHAIN.BLAST]: { duneName: "blast", start: "2025-07-07" },
  [CHAIN.HEMI]: { duneName: "hemi", start: "2025-07-23" },
  [CHAIN.MORPH]: { duneName: "morph", start: "2025-07-11" },
  [CHAIN.SSEED]: { duneName: "superseed", start: "2025-07-10" },
  [CHAIN.STORY]: { duneName: "story", start: "2025-07-10" },
  [CHAIN.FLOW]: { duneName: "flow", start: "2025-07-23" },
  [CHAIN.BOBA]: { duneName: "boba", start: "2025-07-23" },
  [CHAIN.SEI]: { duneName: "sei", start: "2025-07-11" },
  [CHAIN.B3]: { duneName: "b3", start: "2025-07-23" },
  [CHAIN.DEGEN]: { duneName: "degen", start: "2025-07-23" },
  [CHAIN.CORN]: { duneName: "corn", start: "2025-07-23" },
};

const duneNames = Object.values(chainConfig).map((c) => `'${c.duneName}'`).join(", ");
