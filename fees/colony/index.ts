import { Adapter, FetchOptions, FetchResultV2 } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

import { stakingFees } from "./staking";
import { dexFees } from "./dex";
import { earlyStageFees } from "./earlystage";
import { caiFees } from "./cai";
import { validatorProgramFees } from "./validatorProgram";
import { airdrops } from "./airdrops";
import { masterChef } from "./masterChef";

const ColonyGovernanceToken = "0xec3492a2508DDf4FDc0cD76F31f340b30d1793e6";

const stakingSubgraphEndpoint = 'https://graph.colonylab.io/subgraphs/name/colony/stakingV3-avalanche-production';
const dexSubgraphEndpoint = 'https://graph.colonylab.io/subgraphs/name/colony-dex/exchange-avalanche-production';
const earlystageSubgraphEndpoint = 'https://graph.colonylab.io/subgraphs/name/colony/earlystage-avalanche-production';
const masterChefSubgraphEndpoint = 'https://graph.colonylab.io/subgraphs/name/colony-dex/masterchef-avalanche-production'

const methodology = {
    HoldersRevenue: "Revenue distributed to token stakers includes 100% from CLY staking and unstaking fees, 50% of CAI fees, 8% of early-stage activity fees (ceTokens), and 70% of Validator Program activity revenues. This distribution creates a strong APY for CLY stakers, incentivizing protocol staking and long-term involvement in Colony's protocol.",
    SupplySideRevenue: "83.33% of the fees collected from Colony DEX transactions are distributed to liquidity providers. Additionally, 10% of ceTokens are distributed to staked liquidity providers on Colony's DEX, incentivizing them to continue providing liquidity and supporting the exchange. Additional revenue can be generated through farm rewards based on specific marketing campaigns and incentive programs.",
    ProtocolRevenue: "Revenue sources directly retained by the protocol include 50% from CAI fees (minting 0.20%, redemption 0.5%, and management 1%), 2% from early-stage platform activities (ceTokens distribution), 2% from USDC fundraised by a project, 16.66% from Colony DEX swap fees, and 30% from Validator Program activities. These funds support the protocol's ongoing development and operations."
}

async function fetch(options: FetchOptions): Promise<FetchResultV2> {
  const { createBalances } = options;

  const stakingResult = await stakingFees(
    options,
    stakingSubgraphEndpoint,
    ColonyGovernanceToken
  );

  const dexResult = await dexFees(
    options,
    dexSubgraphEndpoint
  );

  const earlystageResult = await earlyStageFees(
    options,
    earlystageSubgraphEndpoint,
  );

  const caiResult = await caiFees(
    options
  );

  const validatorProgramResult = await validatorProgramFees(
    options,
    stakingSubgraphEndpoint
  );

  const airdropsResult = await airdrops(
    options,
    stakingSubgraphEndpoint
  );

  const masterChefResults = await masterChef(
    options,
    masterChefSubgraphEndpoint,
    earlystageSubgraphEndpoint
  );

  let dailyFees = createBalances();
  let dailyRevenue = createBalances();
  let dailyHoldersRevenue = createBalances();
  let dailyProtocolRevenue = createBalances();
  let dailySupplySideRevenue = createBalances();

  // --- Holders Revenue
  dailyHoldersRevenue.addBalances(stakingResult.dailyHoldersRevenue)
  dailyHoldersRevenue.addBalances(earlystageResult.dailyHoldersRevenue)
  dailyHoldersRevenue.addBalances(caiResult.dailyHoldersRevenue)
  dailyHoldersRevenue.addBalances(validatorProgramResult.dailyHoldersRevenue)
  dailyHoldersRevenue.addBalances(airdropsResult.dailyHoldersRevenue)

  // --- Protocol Revenue
  dailyProtocolRevenue.addBalances(earlystageResult.dailyProtocolRevenue)
  dailyProtocolRevenue.addBalances(caiResult.dailyProtocolRevenue)
  dailyProtocolRevenue.addBalances(validatorProgramResult.dailyProtocolRevenue)
  dailyProtocolRevenue.addBalances(dexResult.dailyProtocolRevenue)

  // --- Supply Side Revenue
  dailySupplySideRevenue.addBalances(dexResult.dailySupplySideRevenue)
  dailySupplySideRevenue.addBalances(masterChefResults.dailySupplySideRevenue)

  // --- Revenue
  dailyRevenue.addBalances(dailyProtocolRevenue)
  dailyRevenue.addBalances(dailyHoldersRevenue)

  // --- Fees
  dailyFees.addBalances(dailyRevenue)
  dailyFees.addBalances(dailySupplySideRevenue)

  return {
    dailyVolume: dexResult.dailyVolume,
    dailyFees,
    dailyRevenue,
    dailyHoldersRevenue,
    dailyProtocolRevenue,
    dailySupplySideRevenue,
  }
}

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.AVAX]: {
      fetch,
      start: '2024-01-01',
    },
  },
  methodology,
}

export default adapter;
