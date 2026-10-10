import { MovesPanel } from "@/components/moves-panel";
import { PageHeader } from "@/components/portvue/kit";

export default function EventsPage() {
  return (
    <>
      <PageHeader
        title="Events"
        subtitle="What moved your portfolio, and possible reasons why."
      />
      <MovesPanel />
    </>
  );
}
