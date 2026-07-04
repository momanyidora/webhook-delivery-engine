

const retryDelays = [
        0,
        5000,
        10000,
        15000,
        20000,
      
];

export function getNextAttemptTime(attempt: number): Date | null{
    if(attempt >= retryDelays.length){
        return null;
    }
    return new Date(Date.now() + retryDelays[attempt]);
}