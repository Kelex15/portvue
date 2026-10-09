// Prints every connected account and position. Run: npm run inspect
import { Snaptrade, SnaptradeAuth } from "snaptrade-typescript-sdk";

const snaptrade = new Snaptrade({
  auth: SnaptradeAuth.personalApiKey({
    clientId: process.env.SNAPTRADE_CLIENT_ID,
    consumerKey: process.env.SNAPTRADE_CONSUMER_KEY,
  }),
});

const { data: accounts } = await snaptrade.accountInformation.listUserAccounts();
console.log(`${accounts.length} account(s)\n`);

for (const a of accounts) {
  console.log(`== ${a.name} | ${a.institution_name} | #${a.number} | id ${a.id}`);
  console.log(`   balance total: ${a.balance?.total?.amount} ${a.balance?.total?.currency}`);

  const { data: balances } = await snaptrade.accountInformation.getUserAccountBalance({ accountId: a.id });
  for (const b of balances) console.log(`   cash ${b.cash} ${b.currency?.code} (buying power ${b.buying_power})`);

  const { data: pos } = await snaptrade.accountInformation.getAllAccountPositions({ accountId: a.id });
  console.log(`   positions (as of ${pos.data_freshness?.as_of}):`);
  console.table(
    pos.results.map((p) => ({
      symbol: p.instrument?.symbol,
      kind: p.instrument?.kind,
      name: p.instrument?.description,
      units: p.units,
      price: p.price,
      cost_basis: p.cost_basis,
      currency: p.currency,
      cash_eq: p.cash_equivalent,
    })),
  );
}
