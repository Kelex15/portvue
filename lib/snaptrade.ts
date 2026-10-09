import "server-only";
import { Snaptrade, SnaptradeAuth } from "snaptrade-typescript-sdk";

export const snaptrade = new Snaptrade({
  auth: SnaptradeAuth.personalApiKey({
    clientId: process.env.SNAPTRADE_CLIENT_ID!,
    consumerKey: process.env.SNAPTRADE_CONSUMER_KEY!,
  }),
});
