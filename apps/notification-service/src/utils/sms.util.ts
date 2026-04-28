import { Vonage } from "@vonage/server-sdk";

interface SendSMSParams {
    phoneNumber: string;
    message: string;
    sender?: string;
}

const vonage = new Vonage({
    apiKey: process.env.SMS_API_KEY,
    apiSecret: process.env.SMS_API_SECRET
});

export const sendSMS = async ({
    phoneNumber,
    message,
    sender
}: SendSMSParams): Promise<string | null> => {
    try {
        const from = sender || "447491163443";

        const response: any = await vonage.sms.send({
            to: phoneNumber,
            from: from,
            text: message
        });

        const result = response.messages[0];

        if (result.status === "0") {
            console.log("✅ Send SMS success:", result["message-id"]);
            return result["message-id"];
        } else {
            console.log("❌ Send SMS failed:", result["error-text"]);
            return null;
        }

    } catch (error: any) {
        console.error("🚨 Error sending SMS:", error.message);
        return null;
    }
};