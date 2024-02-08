// contract
// 0xb01b315e32d1d9b5ce93e296d483e1f0aad39e75
// topic: 0x9bbd517758fbae61197f1c1c04c8614064e89512dbaf4350dcdf76fcaa5e2161
// poolAmount / 1e6

// 0xd20508E1E971b80EE172c73517905bfFfcBD87f9
// topic: 0x4f2ce4e40f623ca765fc0167a25cb7842ceaafb8d82d3dec26ca0d0e0d2d4896 // poolCreated
// topic: 1 // pool address

// pool address
// topic: 0xd1055dc2c2a003a83dfacb1c38db776eab5ef89d77a8f05a3512e8cf57f953ce
// (interestAmount - reserveAmount) / 1e6

// --- rev
// 0xb01b315e32d1d9b5ce93e296d483e1f0aad39e75
// topic: 0xf3583f178a8d4f8888c3683f8e948faf9b6eb701c4f1fab265a6ecad1a1ddebb
// amount / 1e6

// 0x8481a6ebaf5c7dabc3f7e09e44a89531fd31f822
// topic: 0xf3583f178a8d4f8888c3683f8e948faf9b6eb701c4f1fab265a6ecad1a1ddebb
// amount / 1e6


// pool address
// topic: 0xf3583f178a8d4f8888c3683f8e948faf9b6eb701c4f1fab265a6ecad1a1ddebb
// amount / 1e6

import { FetchResultFees, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getBlock } from "../helpers/getBlock";
import * as sdk from "@defillama/sdk";
import { EventLog } from "ethers";


const pools: string[] = [
  '0x8bbd80f88e662e56b918c353da635e210ece93c6',
  '0x1e73b5c1a3570b362d46ae9bf429b25c05e514a7',
  '0x95715d3dcbb412900deaf91210879219ea84b4f8',
  '0x0e2e11dc77bbe75b2b65b57328a8e4909f7da1eb',
  '0x7bdf2679a9f3495260e64c0b9e0dfeb859bad7e0',
  '0x4b2ae066681602076adbe051431da7a3200166fd',
  '0x1cc90f7bb292dab6fa4398f3763681cfe497db97',
  '0x3634855ec1beaf6f9be0f7d2f67fc9cb5f4eeea4',
  '0x67df471eacd82c3dbc95604618ff2a1f6b14b8a1',
  '0x2107ade0e536b8b0b85cca5e0c0c3f66e58c053c',
  '0x9e8b9182abba7b4c188c979bc8f4c79f7f4c90d3',
  '0xfce88c5d0ec3f0cb37a044738606738493e9b450',
  '0xd798d527f770ad920bb50680dbc202bb0a1dafd6',
  '0xe32c22e4d95cae1fb805c60c9e0026ed57971bcf',
  '0xefeb69edf6b6999b0e3f2fa856a2acf3bdea4ab5',
  '0xc13465ce9ae3aa184eb536f04fdc3f54d2def277',
  '0xaa2ccc5547f64c5dffd0a624eb4af2543a67ba65',
  '0xf74ea34ac88862b7ff419e60e476be2651433e68',
  '0xc9bdd0d3b80cc6efe79a82d850f44ec9b55387ae',
  '0xe6c30756136e07eb5268c3232efbfbe645c1ba5a',
  '0x1d596d28a7923a22aa013b0e7082bba23daa656b',
  '0x6b42b1a43abe9598052bb8c21fd34c46c9fbcb8b',
  '0x418749e294cabce5a714efccc22a8aade6f9db57',
  '0xa49506632ce8ec826b0190262b89a800353675ec',
  '0x00c27fc71b159a346e179b4a1608a0865e8a7470',
  '0xd09a57127bc40d680be7cb061c2a6629fe71abef',
  '0xb26b42dd5771689d0a7faeea32825ff9710b9c11',
  '0x759f097f3153f5d62ff1c2d82ba78b6350f223e3',
  '0x89d7c618a4eef3065da8ad684859a547548e6169',
  '0xd43a4f3041069c6178b99d55295b00d0db955bb5',
  '0x294371f9ec8b6ddf59d4a2ceba377d19b9735d34',
  '0x538473c3a69da2b305cf11a40cf2f3904de8db5f'
]

const core_pool = '0xb01b315e32d1d9b5ce93e296d483e1f0aad39e75';
const senior_pool = '0x8481a6ebaf5c7dabc3f7e09e44a89531fd31f822';
const topic0_interest_collected = '0x9bbd517758fbae61197f1c1c04c8614064e89512dbaf4350dcdf76fcaa5e2161';
const topic0_payment_appli = '0xd1055dc2c2a003a83dfacb1c38db776eab5ef89d77a8f05a3512e8cf57f953ce';
const topic0_reserve_fund_collect = '0xf3583f178a8d4f8888c3683f8e948faf9b6eb701c4f1fab265a6ecad1a1ddebb'

const fetchFees = async (timestamp: number): Promise<FetchResultFees> => {
  const ONE_DAY_IN_SECONDS = 86400;
  const toTimestamp = timestamp;
  const fromTimestamp = timestamp - ONE_DAY_IN_SECONDS;
  const toBlock = await getBlock(toTimestamp, 'ethereum', {});
  const fromBlock = await getBlock(fromTimestamp, 'ethereum', {});

  const logs_interest_collect: EventLog[] = (await sdk.getEventLogs({
    target: core_pool,
    fromBlock: fromBlock,
    toBlock: toBlock,
    topics: [topic0_interest_collected],
    chain: 'ethereum'
  })) as EventLog[];
  const pool_interest_collected = logs_interest_collect
    .reduce((a: number, b: EventLog) => a + Number('0x' + b.data.replace('0x', '').slice(0, 64)), 0) / 1e6;

  const logs_pool_payment_applie: EventLog[] = (await Promise.all(pools.map(async (pool: string) => sdk.getEventLogs({
    target: pool,
    fromBlock: fromBlock,
    toBlock: toBlock,
    topics: [topic0_payment_appli],
    chain: 'ethereum'
  })))).flat() as EventLog[];

  const logs_reserve_fund_collect: EventLog[] = (await Promise.all([...pools, core_pool, senior_pool].map(async (pool: string) => sdk.getEventLogs({
    target: pool,
    fromBlock: fromBlock,
    toBlock: toBlock,
    topics: [topic0_reserve_fund_collect],
    chain: 'ethereum'
  })))).flat() as EventLog[];

  const pool_payment_applied = logs_pool_payment_applie.map((log: EventLog) => {
    const data = log.data.replace('0x', '')
    const interestAmount = Number('0x' + data.slice(0, 64)) / 1e6;
    const reserveAmount = Number('0x' + data.slice(64 * 3, (64 * 3) + 64)) / 1e6;
    return interestAmount - reserveAmount;
  }).reduce((a: number, b: number) => a + b, 0);

  const pool_reserve_fund_collect = logs_reserve_fund_collect.map((log: EventLog) => {
    const amount = Number(log.data) / 1e6;
    return amount;
  }).reduce((a: number, b: number) => a + b, 0);
  const dailyFees = pool_interest_collected + pool_payment_applied + pool_reserve_fund_collect;
  const dailyRevenue = pool_reserve_fund_collect;
  const dailySupplySideRevenue = dailyFees - dailyRevenue;

  return {
    dailyFees: dailyFees.toString(),
    dailyRevenue: dailyRevenue.toString(),
    dailySupplySideRevenue: dailySupplySideRevenue > 0 ? dailySupplySideRevenue.toString() : '0',
    timestamp
  }
}

const adapters: SimpleAdapter = {
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch: fetchFees,
      start: 1629331200
    }
  }
}
export default adapters;
