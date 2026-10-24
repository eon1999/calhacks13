import Link from "next/link";

const routes = ["/hub", "/care", "/settings", "/demo"];

export default function Home() {
  return (
    <main className="mx-auto max-w-xl p-8">
      <h1 className="text-4xl font-bold">Cadence</h1>
      <p className="mt-2 text-lg">Medication timing and symptom companion.</p>
      <ul className="mt-6 space-y-2 text-lg underline">
        {routes.map((r) => (
          <li key={r}>
            <Link href={r}>{r}</Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
