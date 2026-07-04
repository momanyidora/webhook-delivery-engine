import { generateSignature } from "./signatureService";


export interface DeiveryResult{
    success: boolean;
    statusCode?: number;
    errorMessage?: string;
}

export async function deliverWebhook(
    eventId: string,
    destination: string,
    payload: object
): Promise<DeiveryResult>{
    const signature = generateSignature(payload);
    try{
        const response = await fetch(destination,{
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Signature": signature,
                "X-Event-ID": eventId
            },
            body: JSON.stringify(payload)
        });
        if(response.ok){
            return{
                success: true,
                statusCode: response.status,
            };
        }
        return{
            success: false,
            statusCode: response.status,
            errorMessage: response.statusText
        };
    }catch(error){
        // console.error(error);
 return{
    success: false,
    errorMessage:
    error instanceof Error ? error.message: "Unknown error"
   };
  }
}
