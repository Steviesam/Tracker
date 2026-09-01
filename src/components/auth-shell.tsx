import { IconChart, IconDownload, IconSpark, IconUpload } from "@/components/icons";

const POINTS: Array<{ icon: React.ReactNode; title: string; body: string }> = [
  {
    icon: <IconUpload className="h-4 w-4" />,
    title: "Any spreadsheet",
    body: "Every sheet and cell is scanned, so links can sit in any column.",
  },
  {
    icon: <IconChart className="h-4 w-4" />,
    title: "Real public numbers",
    body: "Views, likes, comments and shares — never estimated, and N/A says why.",
  },
  {
    icon: <IconSpark className="h-4 w-4" />,
    title: "Creator engagement",
    body: "Recent-video averages and engagement rate for each account.",
  },
  {
    icon: <IconDownload className="h-4 w-4" />,
    title: "Export in one click",
    body: "The whole table as CSV or Excel, ready to send on.",
  },
];

/**
 * Shared frame for login and signup. The brand panel is decorative and hidden below `lg`,
 * where the form should have the full screen rather than compete with it.
 */
export default function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  footer: React.ReactNode;
}) {
  return (
    <main className="flex min-h-screen">
      <section className="relative hidden w-[46%] max-w-xl overflow-hidden bg-slate-950 p-12 text-white lg:flex lg:flex-col">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -left-24 -top-24 h-80 w-80 rounded-full bg-indigo-600/30 blur-3xl"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-32 -right-16 h-96 w-96 rounded-full bg-fuchsia-600/20 blur-3xl"
        />

        <div className="relative flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600">
            <IconChart className="h-4 w-4" />
          </span>
          <span className="font-semibold">Social Metrics Tracker</span>
        </div>

        <div className="relative mt-auto">
          <h2 className="text-3xl font-semibold leading-tight tracking-tight">
            Stop opening hundreds of posts by hand.
          </h2>
          <p className="mt-3 max-w-md text-slate-400">
            Hand it a pile of Instagram, YouTube and Facebook links. Get one table of public
            metrics back.
          </p>

          <ul className="mt-9 space-y-5">
            {POINTS.map((point, index) => (
              <li
                key={point.title}
                className="animate-rise flex gap-3.5"
                style={{ "--i": index + 1 } as React.CSSProperties}
              >
                <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white/10 text-indigo-300">
                  {point.icon}
                </span>
                <div>
                  <p className="text-sm font-medium">{point.title}</p>
                  <p className="mt-0.5 text-sm leading-snug text-slate-400">{point.body}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative mt-auto pt-10 text-xs text-slate-500">
          Public data only. No campaigns, no CRM, no historical tracking.
        </p>
      </section>

      <section className="flex flex-1 items-center justify-center px-4 py-10">
        <div className="animate-fade w-full max-w-sm">
          <div className="mb-8 flex items-center gap-2.5 lg:hidden">
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 text-white">
              <IconChart className="h-4 w-4" />
            </span>
            <span className="font-semibold">Social Metrics Tracker</span>
          </div>

          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          <p className="mt-1.5 text-sm text-slate-500">{subtitle}</p>

          {children}

          <p className="mt-8 text-center text-sm text-slate-500">{footer}</p>
        </div>
      </section>
    </main>
  );
}
