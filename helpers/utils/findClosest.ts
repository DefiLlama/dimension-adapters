export function findClosest<T extends {time:string|number}>(timestamp:number, items:T[], maxTimestampDifferenceInSeconds?: number){
    const closest = items.reduce((closest, att) => {
        if (Math.abs(new Date(att.time).getTime() - timestamp * 1e3) < Math.abs(new Date(closest.time).getTime() - timestamp * 1e3)) {
            return att
        }
        return closest
    })
    if(maxTimestampDifferenceInSeconds !== undefined){
        const timeDifference = Math.abs(new Date(closest.time).getTime()/1e3 - timestamp)
        if(timeDifference > maxTimestampDifferenceInSeconds){
            throw new Error(`The closest item is ${timeDifference} seconds away from target, but the maximum authorized is ${maxTimestampDifferenceInSeconds}`)
        }
    }
    return closest
}