import type { SimpleAdapter } from "../../adapters/types";
import type { FetchOptions, FetchResultV2, FetchV2 } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const CONTRACTS = {
  V1: "0xC9f0Cc4e0cbb1143CcBE12Fc59cE5270112d7845",
  V2: "0xF92dEC11Eb85DE7a3E618c4E8e4F79Fc60651Ba8",
  V3: "0x3f117952Bb5FbB19a6aDf4fBDa28F86bC6eD9587",
  CLAIM: "0xa41C23Dd9525FD8620F3a49305eCecD3639Fbc5c",
};

const WLD = "0x2cFc85d8E48F8EAB294be644d9E25C3030863003";
const HTAP = "0xab4EAAC9D4DF861C82A0637db86dE45dd562379a";

const abi = {
  HTAPBought: "event HTAPBought(address indexed user, uint256 wldSpent, uint256 htapReceived, uint256 timestamp)",
  WLDDistributed: "event WLDDistributed(uint256 lpAmount, uint256 buybackAmount, uint256 treasuryAmount)",
  Claimed: "event Claimed(address indexed user, uint256 claimed, uint256 burned)",
};

async function fetchContractData(contract: string, options: FetchOptions) {
  const dailyVolume = options.createBalances();

  // Get WLD distribution logs
  const wldLogs = await options.getLogs({
    target: contract,
    eventAbi: abi.WLDDistributed,
  });

  for (const log of wldLogs) {
    // Add total WLD volume (sum of all portions)
    const totalWLD = BigInt(log.lpAmount) + BigInt(log.buybackAmount) + BigInt(log.treasuryAmount);
    dailyVolume.add(WLD, totalWLD);
  }

  // Get HTAP volume from HTAPBought events
  const htapLogs = await options.getLogs({
    target: contract,
    eventAbi: abi.HTAPBought,
  });

  for (const log of htapLogs) {
    // Add HTAP volume (amount received)
    dailyVolume.add(HTAP, BigInt(log.htapReceived));
  }

  return dailyVolume;
}

async function fetchAirdropData(options: FetchOptions) {
  const dailyVolume = options.createBalances();

  // Track claimed tokens
  const claimLogs = await options.getLogs({
    target: CONTRACTS.CLAIM,
    eventAbi: abi.Claimed,
  });

  for (const log of claimLogs) {
    // Add claimed HTAP to volume
    dailyVolume.add(HTAP, BigInt(log.claimed));
    // Add burned HTAP to volume
    dailyVolume.add(HTAP, BigInt(log.burned));
  }

  return dailyVolume;
}

export const fetch: FetchV2 = async (options: FetchOptions): Promise<FetchResultV2> => {
  const dailyVolume = options.createBalances();

  // Fetch data from all three versions of PayWLDWithPermit
  const v1Volume = await fetchContractData(CONTRACTS.V1, options);
  const v2Volume = await fetchContractData(CONTRACTS.V2, options);
  const v3Volume = await fetchContractData(CONTRACTS.V3, options);

  // Fetch airdrop data
  const airdropVolume = await fetchAirdropData(options);

  // Combine all volumes
  dailyVolume.addBalances(v1Volume);
  dailyVolume.addBalances(v2Volume);
  dailyVolume.addBalances(v3Volume);
  dailyVolume.addBalances(airdropVolume);

  return {
    dailyVolume,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.WC]: {
      fetch: fetch,
      start: "2025-04-19",
      meta: {
        methodology: {
          dailyVolume: "Volume is calculated as the sum of: 1) Total WLD distributed (LP + buyback + treasury) from WLDDistributed events and HTAP received from HTAPBought events across all three contract versions, 2) All HTAP claimed and penaltized for early claim in the airdrop contract",
        },
      },
    },
  },
};

export default adapter;