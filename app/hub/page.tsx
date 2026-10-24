import { WearableSimulator } from "@/components/wearable/wearable-simulator";

// Browser stand-in for the wristband until firmware/band is built. It calls the
// same /api/voice/* endpoints the device will use.
export default function HubPage() {
  return (
    <main className="p-8">
      <h1 className="mb-6 text-3xl font-bold">Wearable simulator</h1>
      <WearableSimulator />
    </main>
  );
}
