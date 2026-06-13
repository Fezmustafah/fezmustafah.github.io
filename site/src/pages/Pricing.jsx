import { Check, ArrowRight, Sparkles } from "lucide-react";
import { PageHeader, CTA, useReveal, APP_URL } from "../sections.jsx";

// WhatsApp the founder (Faiz Mustafa, Dubai) with a plan-specific message so we
// see context in the first reply.
const WA_NUMBER = "971502925963";
const wa = (msg) => `https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(msg)}`;
const PRO_MSG =
  "Hello, I'm interested in the Pro plan ($9 / month) — unlimited AI generations, unlimited letterheads & layouts, stamp library, priority AI model, brand kits for multiple companies, export to PNG, and email support.";
const BIZ_MSG =
  "Hello, I'd like to talk about the Business plan ($29 / month) — everything in Pro plus team workspaces (5 seats), role-based access, WhatsApp integration, custom domain on documents, and priority support.";

const TIERS = [
  {
    name: "Free",
    price: "0",
    blurb: "Everything to ship your first documents.",
    cta: "Start free",
    href: APP_URL,
    highlight: false,
    features: [
      "5 AI-generated documents on signup",
      "Unlimited manual editing",
      "Up to 3 letterheads on file",
      "Sign / stamp blender",
      "Cloud sync across devices",
      "Voice input",
    ],
  },
  {
    name: "Pro",
    price: "9",
    blurb: "For freelancers & small teams shipping daily.",
    cta: "Buy on WhatsApp",
    href: wa(PRO_MSG),
    highlight: true,
    features: [
      "Unlimited AI generations",
      "Unlimited letterheads & layouts",
      "Stamp library",
      "Priority AI model",
      "Brand kits for multiple companies",
      "Export to PNG",
      "Email support",
    ],
  },
  {
    name: "Business",
    price: "29",
    blurb: "Teams, multiple brands, advanced control.",
    cta: "Talk on WhatsApp",
    href: wa(BIZ_MSG),
    highlight: false,
    features: [
      "Everything in Pro",
      "Team workspaces (5 seats)",
      "Role-based access",
      "WhatsApp integration (beta)",
      "Custom domain on documents",
      "Priority support",
    ],
  },
];

function Tier({ t }) {
  return (
    <div className={"reveal flex flex-col rounded-3xl border bg-white p-7 shadow-card " + (t.highlight ? "border-brass ring-2 ring-brass/30" : "border-hairline")}>
      {t.highlight && (
        <div className="mb-4 inline-flex w-fit items-center gap-1 rounded-full bg-brass/15 px-2.5 py-1 text-[11px] font-semibold text-brass">
          <Sparkles size={12} /> Most popular
        </div>
      )}
      <h3 className="font-display text-xl font-bold text-ink">{t.name}</h3>
      <p className="mt-1 text-sm text-ink/55">{t.blurb}</p>
      <div className="mt-5 flex items-baseline gap-1">
        <span className="display text-5xl font-extrabold text-ink">${t.price}</span>
        <span className="text-sm text-ink/55">/ month</span>
      </div>
      <a
        href={t.href}
        target={t.href.startsWith("http") ? "_blank" : undefined}
        rel={t.href.startsWith("http") ? "noopener noreferrer" : undefined}
        className={"mt-6 " + (t.highlight ? "btn-primary justify-center" : "btn-ghost justify-center")}
      >
        {t.cta} <ArrowRight size={16} />
      </a>
      <ul className="mt-7 space-y-2.5">
        {t.features.map((f) => (
          <li key={f} className="flex items-start gap-2 text-sm text-ink/75">
            <Check size={16} className="mt-0.5 shrink-0 text-brass" /> {f}
          </li>
        ))}
      </ul>
    </div>
  );
}

const FAQ = [
  ["Is it really free to start?", "Yes. You get 5 AI-generated documents on signup, with no card needed. Manual editing and downloads are unlimited even on the free plan."],
  ["What happens after my 5 free AI documents?", "You can keep editing, downloading, and using the tool by hand forever. To keep generating with AI, upgrade to Pro (or wait for our monthly free quota refresh — coming soon)."],
  ["Where are my letterheads stored?", "If you're signed in, in your private Supabase row (encrypted in transit, isolated by Row Level Security). If you're not, only on your device. We never store the finished PDFs."],
  ["Do you have a refund policy?", "Yes — 14-day, no-questions-asked refund on Pro subscriptions while we're in early access."],
  ["Will pricing change?", "Prices shown are for the early-access launch and are locked in for the first 12 months for anyone who signs up now."],
];

function FAQSection() {
  const ref = useReveal();
  return (
    <section ref={ref} className="px-5 py-20">
      <div className="mx-auto max-w-3xl">
        <div className="reveal label mb-3 text-brass">Pricing FAQ</div>
        <h2 className="reveal display text-3xl font-bold text-ink sm:text-4xl">Questions worth answering.</h2>
        <div className="mt-8 divide-y divide-hairline rounded-2xl border border-hairline bg-white">
          {FAQ.map(([q, a]) => (
            <details key={q} className="reveal group p-5">
              <summary className="flex cursor-pointer items-center justify-between font-semibold text-ink">
                {q}
                <span className="ml-4 text-brass transition group-open:rotate-45">+</span>
              </summary>
              <p className="mt-3 text-sm leading-relaxed text-ink/65">{a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

export default function Pricing() {
  const ref = useReveal();
  return (
    <>
      <PageHeader
        eyebrow="Pricing"
        title={<>Free to start. <span className="flourish font-normal text-brass">Fair to scale.</span></>}
        sub="Every plan includes the full editor, the AI writer, and cloud sync. You only pay when you want more AI."
      />
      <section ref={ref} className="px-5 pb-12">
        <div className="mx-auto grid max-w-6xl gap-6 md:grid-cols-3">
          {TIERS.map((t) => <Tier key={t.name} t={t} />)}
        </div>
      </section>
      <FAQSection />
      <CTA title="Start with 5 free AI documents." sub="No card. Sign in with Google or email." primary="Sign up free" />
    </>
  );
}
