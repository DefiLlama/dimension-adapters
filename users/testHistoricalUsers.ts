require("dotenv").config();
import protocolAddresses from "./routers/routerAddresses";
import { convertChainToFlipside, isAcceptedChain } from "./utils/convertChain";
import { queryFlipside } from "../helpers/flipsidecrypto";

function encode(n:number[]){
  const digit="0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-_";
  const toB64=(x:number)=>x.toString(2).split(/(?=(?:.{6})+(?!.))/g).map(v=>digit[parseInt(v,2)]).join("")
  //const fromB64=(x:string)=>x.split("").reduce((s,v)=>s*64+digit.indexOf(v),0)

  const str = n.map(nn=>toB64(nn).padStart(4, "=")).join("")
  return str
}

async function main() {
    const selectedProtocol = process.argv[2]
    const filtered = protocolAddresses.filter(addresses => {
        return Object.entries(addresses.addresses).some(([chain, addys]) => isAcceptedChain(chain) && addys.length > 0)
            && addresses.name.toLowerCase() === selectedProtocol.toLowerCase()
    })
    if (filtered.length === 0) {
        console.log("No protocol with that name!")
    }
    const { name, addresses, id } = filtered[0]
    const chainArray = Object.entries(addresses).filter(([chain]) => isAcceptedChain(chain))
    const usersChart = await queryFlipside(`
WITH
  ${chainArray.map(([chain, chainAddresses]: [string, string[]]) =>
        `${chain} AS (
        SELECT
            date_trunc(day, block_timestamp) as dt,
            from_address
        FROM
            ${convertChainToFlipside(chain)}.core.fact_transactions
        WHERE
            ${chainAddresses.length > 1 ?
            `TO_ADDRESS in (${chainAddresses.map(a => `'${a.toLowerCase()}'`).join(',')})` :
            `TO_ADDRESS = '${chainAddresses[0].toLowerCase()}'`}
        )`).join(',\n')}

SELECT
  dt,
  COUNT(DISTINCT from_address) AS active_users
FROM
  (
    ${chainArray.map(([chain]) => `SELECT
      dt,
      from_address
    FROM
    ${chain}`).join("\nUNION\n")}
  )
GROUP BY
  dt
ORDER BY
  dt ASC;`)
    const sequentialData = [] as number[]
    let lastTimestamp:number|null = null
    const parseDate = (dateString:string) =>{
      const date = new Date(`${dateString} UTC`)
      return Math.round(date.getTime() / 1e3)
    }
    usersChart.forEach(([dateString, users]:[string,number]) => {
        const start = parseDate(dateString)
        if(lastTimestamp !== null){
          const DAY = 24*3600
          while(lastTimestamp + 1.5*DAY < start){
            sequentialData.push(0)
            lastTimestamp += DAY
          }
        }
        sequentialData.push(users)
        lastTimestamp = start
    })
    console.log(`Check the chart at https://defillama.com/adapterTest?start=${parseDate(usersChart[0][0])}&data=${encode(sequentialData)}`)
}
main()


