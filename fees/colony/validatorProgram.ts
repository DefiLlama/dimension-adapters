import ADDRESSES from '../../helpers/coreAssets.json'
import { Balances } from "@defillama/sdk";
import { FetchOptions } from "../../adapters/types";

export interface ValidatorProgramFees {
  dailyProtocolRevenue: Balances;
  dailyHoldersRevenue: Balances;
}

const STAKING_CONTRACT =
  "0x62685d3EAacE96D6145D35f3B7540d35f482DE5b";

const WAVAX = ADDRESSES.avax.WAVAX;
const VALIDATOR_CATEGORY = 1;

const REWARD_ADDED_EVENT =
  "event RewardAdded(address indexed token, uint8 category, uint256 amount, uint256 duration)";

export async function validatorProgramFees(
  options: FetchOptions,
): Promise<ValidatorProgramFees> {
  const { getLogs, createBalances } = options;

  const dailyProtocolRevenue = createBalances();
  const dailyHoldersRevenue = createBalances();

  // Fetch RewardAdded events
  const logs = await getLogs({
    target: STAKING_CONTRACT,
    eventAbi: REWARD_ADDED_EVENT,
    topic: '0x76f4be3e874cc10b0db82373976a4b261a91b466d6a1f4db6563e5bd25ebba9e'
  });

  let totalValidatorRewards = 0n;

  for (const log of logs) {
    if (
      log.token.toLowerCase() === WAVAX.toLowerCase() &&
      Number(log.category) === VALIDATOR_CATEGORY
    ) {
      totalValidatorRewards += BigInt(log.amount);
    }
  }

  if (totalValidatorRewards > 0n) {
    // 70% to holders
    const holdersShare = totalValidatorRewards * 70n / 100n;

    // 30% protocol revenue
    const protocolShare = totalValidatorRewards - holdersShare;

    dailyHoldersRevenue.add(WAVAX, holdersShare);
    dailyProtocolRevenue.add(WAVAX, protocolShare);
  }

  return {
    dailyProtocolRevenue,
    dailyHoldersRevenue,
  };
}
