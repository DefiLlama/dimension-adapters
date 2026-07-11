import { FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDune } from "../../helpers/dune";

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

// One cross-chain query for every chain's deposits in the day. Native deposits are
// tagged 'native' (priced via the gas token); ERC-20 deposits return the token address.
// Byte offsets: native data = [from, amount, id]; erc20 data = [from, token, amount, id].
const prefetch = async (options: FetchOptions) => {
  const sql = `
    SELECT
      blockchain,
      CASE WHEN topic0 = ${NATIVE_DEPOSIT} THEN 'native'
           ELSE '0x' || lower(to_hex(bytearray_substring(data, 45, 20))) END AS token,
      CAST(SUM(
        CASE WHEN topic0 = ${NATIVE_DEPOSIT}
             THEN bytearray_to_uint256(bytearray_substring(data, 33, 32))
             ELSE bytearray_to_uint256(bytearray_substring(data, 65, 32)) END
      ) AS VARCHAR) AS amount
    FROM evms.logs
    WHERE contract_address = ${RELAY_DEPOSITORY}
      AND blockchain IN (${duneNames})
      AND topic0 IN (${NATIVE_DEPOSIT}, ${ERC20_DEPOSIT})
      AND block_time >= from_unixtime(${options.startTimestamp})
      AND block_time < from_unixtime(${options.endTimestamp})
    GROUP BY 1, 2
  `;
  return await queryDune("3996608", { fullQuery: sql }, options);
};
