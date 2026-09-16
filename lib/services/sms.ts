import { requireLocalDemo } from "@/lib/config/shared";
export interface SmsMessage {
  recipient: string;
  text: string;
}
export interface SmsResult {
  status: "mock";
  message: string;
}
export interface SmsProvider {
  send(message: SmsMessage): Promise<SmsResult>;
}
export const mockSmsProvider: SmsProvider = {
  async send(message) {
    requireLocalDemo();
    if (!message.recipient || !message.text)
      throw new Error("SMS recipient and text required");
    return { status: "mock", message: "Mock SMS simulated; no message sent" };
  },
};
