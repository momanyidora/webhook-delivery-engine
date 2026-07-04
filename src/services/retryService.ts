

const retryDelays = [
        0,
        60 * 1000,
        5 * 60 * 1000,
        30 * 60 * 1000,
        2 * 60 * 60 * 1000,
      
];

export function getNextAttemptTime(attempt: number): Date | null{
    if(attempt >= retryDelays.length){
        return null;
    }
    return new Date(Date.now() + retryDelays[attempt]);
}