import { IconBriefcase, IconChart, IconCompass, IconSpark } from "@/components/icons";

const POINTS: Array<{ icon: React.ReactNode; title: string; body: string }> = [
  {
    icon: <IconBriefcase className="h-4 w-4" />,
    title: "Campaigns that track themselves",
    body: "Move a creator to the next stage and the task, the deadline and the progress follow.",
  },
  {
    icon: <IconCompass className="h-4 w-4" />,
    title: "Your creator directory",
    body: "Thousands of accounts, filtered by state, city, niche and audience size.",
  },
  {
    icon: <IconChart className="h-4 w-4" />,
    title: "Real public numbers",
    body: "Views, likes and comments — never estimated, and N/A always says why.",
  },
  {
    icon: <IconSpark className="h-4 w-4" />,
    title: "Engagement you can quote",
    body: "Recent-video averages and engagement rate for any account you paste in.",
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
    <main className="flex min-h-screen bg-white">
      <section className="relative hidden w-[46%] max-w-2xl overflow-hidden bg-ink-950 p-12 text-white lg:flex lg:flex-col">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -left-24 -top-24 h-80 w-80 rounded-full bg-indigo-600/25 blur-3xl"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-32 -right-16 h-96 w-96 rounded-full bg-fuchsia-600/20 blur-3xl"
        />
        {/* A faint grid under the glow: it gives the flat panel a surface to sit on. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              "linear-gradient(to right, white 1px, transparent 1px), linear-gradient(to bottom, white 1px, transparent 1px)",
            backgroundSize: "44px 44px",
            maskImage: "radial-gradient(ellipse at 30% 20%, black, transparent 75%)",
          }}
        />

        <div className="relative flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-[10px] bg-gradient-to-br from-indigo-500 to-violet-600 shadow-lg shadow-indigo-950/40 ring-1 ring-inset ring-white/20">
            <IconChart className="h-[18px] w-[18px]" />
          </span>
          <span className="font-semibold tracking-tight">Social Metrics</span>
        </div>

        <div className="relative mt-auto">
          <h2 className="max-w-lg text-[34px] font-semibold leading-[1.15] tracking-[-0.02em]">
            Run every campaign without opening a spreadsheet.
          </h2>
          <p className="mt-4 max-w-md leading-relaxed text-slate-400">
            Find the creators, agree the rates, watch the work, pay the invoices — in one place,
            on real public numbers.
          </p>

          <ul className="mt-10 space-y-5">
            {POINTS.map((point, index) => (
              <li
                key={point.title}
                className="animate-rise flex gap-3.5"
                style={{ "--i": index + 1 } as React.CSSProperties}
              >
                <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white/[0.07] text-indigo-300 ring-1 ring-inset ring-white/10">
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
          Public data only. Nothing is estimated, and nothing is scraped from behind a login.
        </p>
      </section>

      <section className="flex flex-1 items-center justify-center px-4 py-10">
        <div className="animate-fade w-full max-w-sm">
          <div className="mb-8 flex items-center gap-2.5 lg:hidden">
            <span className="grid h-9 w-9 place-items-center rounded-[10px] bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-sm">
              <IconChart className="h-[18px] w-[18px]" />
            </span>
            <span className="font-semibold tracking-tight">Social Metrics</span>
          </div>

          <h1 className="text-[26px] font-semibold leading-tight">{title}</h1>
          <p className="mt-2 text-[13px] leading-relaxed text-slate-500">{subtitle}</p>

          {children}

          <p className="mt-8 text-center text-[13px] text-slate-500">{footer}</p>
        </div>
      </section>
    </main>
  );
}
