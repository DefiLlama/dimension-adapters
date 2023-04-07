import { humanizeNumber } from "@defillama/sdk"

async function main(){
    const file = process.argv[2]
    const adapter = await import(`../${file}`)
    await Promise.all(adapter.default.map(async ({name, getUsers}:{name:string, getUsers:any})=>{
        try{
            const end = Math.floor(Date.now()/1e3)
            const start = end - 24*3600
            const users = await getUsers(start, end)
            const table = [] as string[][]
            Object.entries(users).forEach(([chain, section]:[string, any])=>{
                Object.entries(section).forEach(([type, num])=>{
                    table.push([name, chain, type, humanizeNumber(num as number)])
                })
            })
            console.table(table)
        } catch(e){
            console.log(`Adapter for ${name} failed with error`, e)
        }
    }))
}
main()

// eg: npx ts-node users/test.ts users/chains.ts