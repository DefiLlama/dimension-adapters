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
  let totalFees = createBalances();
  let dailyRevenue = createBalances();
  let totalRevenue = createBalances();
  let dailyHoldersRevenue = createBalances();
  let totalHoldersRevenue = createBalances();
  let dailyProtocolRevenue = createBalances();
  let totalProtocolRevenue = createBalances();
  let dailySupplySideRevenue = createBalances();
  let totalSupplySideRevenue = createBalances();

  // --- Holders Revenue
  dailyHoldersRevenue.addBalances(stakingResult.dailyHoldersRevenue)
  totalHoldersRevenue.addBalances(stakingResult.totalHoldersRevenue)

  dailyHoldersRevenue.addBalances(earlystageResult.dailyHoldersRevenue)
  totalHoldersRevenue.addBalances(earlystageResult.totalHoldersRevenue)

  dailyHoldersRevenue.addBalances(caiResult.dailyHoldersRevenue)
  // totalHoldersRevenue.addBalances(caiResult.totalHoldersRevenue)

  dailyHoldersRevenue.addBalances(validatorProgramResult.dailyHoldersRevenue)
  totalHoldersRevenue.addBalances(validatorProgramResult.totalHoldersRevenue)

  dailyHoldersRevenue.addBalances(airdropsResult.dailyHoldersRevenue)
  totalHoldersRevenue.addBalances(airdropsResult.totalHoldersRevenue)

  // --- Protocol Revenue
  dailyProtocolRevenue.addBalances(earlystageResult.dailyProtocolRevenue)
  totalProtocolRevenue.addBalances(earlystageResult.totalProtocolRevenue)

  dailyProtocolRevenue.addBalances(caiResult.dailyProtocolRevenue)
  // totalProtocolRevenue.addBalances(caiResult.totalProtocolRevenue)

  dailyProtocolRevenue.addBalances(validatorProgramResult.dailyProtocolRevenue)
  totalProtocolRevenue.addBalances(validatorProgramResult.totalProtocolRevenue)

  dailyProtocolRevenue.addBalances(dexResult.dailyProtocolRevenue)
  totalProtocolRevenue.addBalances(dexResult.totalProtocolRevenue)

  // --- Supply Side Revenue
  dailySupplySideRevenue.addBalances(dexResult.dailySupplySideRevenue)
  totalSupplySideRevenue.addBalances(dexResult.totalSupplySideRevenue)

  dailySupplySideRevenue.addBalances(masterChefResults.dailySupplySideRevenue)
  totalSupplySideRevenue.addBalances(masterChefResults.totalSupplySideRevenue)

  // --- Revenue
  dailyRevenue.addBalances(dailyProtocolRevenue)
  totalRevenue.addBalances(totalProtocolRevenue)

  dailyRevenue.addBalances(dailyHoldersRevenue)
  totalRevenue.addBalances(totalHoldersRevenue)

  // --- Fees
  dailyFees.addBalances(dailyRevenue)
  totalFees.addBalances(totalRevenue)

  dailyFees.addBalances(dailySupplySideRevenue)
  totalFees.addBalances(totalSupplySideRevenue)

  return {
    // timestamp: dexResult.timestamp,
    // block: dexResult.block,

    dailyVolume: dexResult.dailyVolume,
    // totalVolume: dexResult.totalVolume,

    dailyFees,
    // totalFees,

    dailyRevenue,
    // totalRevenue,

    dailyHoldersRevenue,
    // totalHoldersRevenue,

    dailyProtocolRevenue,
    // totalProtocolRevenue,

    dailySupplySideRevenue,
    // totalSupplySideRevenue
  }
}

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.AVAX]: {
      fetch,
      start: 1704067200,
      meta: {
          methodology
      }
    },
  }
}

export default adapter;
