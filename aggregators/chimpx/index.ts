import { CHAIN } from "../../helpers/chains";
import { FetchOptions, FetchResultVolume, SimpleAdapter } from "../../adapters/types";

// ChimpXVolumeRegistry deployed on BSC mainnet at block 82131810
// https://bscscan.com/address/0x8327839597934e1490f90D06F2b0A549dFC7edeB
const VOLUME_REGISTRY = "0x8327839597934e1490f90D06F2b0A549dFC7edeB";

// VolumeRegistered(address indexed user, uint8 indexed actionType, uint256 volumeUsd, bytes32 txRef, uint256 timestamp)
const EVENT_ABI = "event VolumeRegistered(address indexed user, uint8 indexed actionType, uint256 volumeUsd, bytes32 txRef, uint256 timestamp)";

const fetch = async (options: FetchOptions): Promise<FetchResultVolume> => {
  const dailyVolume = options.createBalances();

  // Trust model: volumeUsd values are relayer-attested. The ChimpX backend
  // relayer calls registerVolume() on-chain after verifying each completed
  // transaction (swap, bridge, lend, borrow, stake, perps) via the underlying
  // protocol's own on-chain receipt. The relayer wallet address is public and
  // auditable on BSCScan. Volume figures are denominated in USD with 18 decimals
  // and correspond to the input/output token value of the routed transaction.
  const logs = await options.getLogs({
    target: VOLUME_REGISTRY,
    eventAbi: EVENT_ABI,
  });

  for (const log of logs) {
    // volumeUsd is stored with 18 decimals; addUSDValue expects a plain number
    const volumeUsd = Number(log.volumeUsd) / 1e18;
    dailyVolume.addUSDValue(volumeUsd);
  }

  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.BSC]: {
      fetch,
      start: '2026-02-19',
    },
  },
  methodology: {
    Volume: "Volume is tracked via VolumeRegistered events emitted by the ChimpXVolumeRegistry contract on BNB Chain. The ChimpX backend relayer records USD volume (18 decimals) on-chain after each verified transaction. Covers swaps, bridges, lending, borrowing, staking, unstaking, and perpetuals (long/short) routed through the ChimpX AI-powered DeFi agent.",
  },
};

export default adapter;
