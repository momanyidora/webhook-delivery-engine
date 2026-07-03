

export interface DeiveryResult{
    success: boolean;
    statusCode?: number;
    errorMessage?: string;
}

export async function deliverWebhook(
    destination: string,
    payload: object
): Promise<DeiveryResult>{
    try{
        const response = await fetch(destination,{
            method: "POST",
            headers: {
                "content-Type": "application/json",
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
 return{
    success: false,
    errorMessage:
    error instanceof Error ? error.message: "Unknown error"
   };
  }
}
