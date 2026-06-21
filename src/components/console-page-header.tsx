import Link from "next/link";

type ConsolePageKey = "admin" | "calendar" | "chores" | "dashboard" | "platform";

type ConsolePageHeaderProps = {
  activePage: ConsolePageKey;
  eyebrow: string;
  title: string;
  description: string;
  aside?: React.ReactNode;
  footer?: React.ReactNode;
};

const navItems: Array<{ href: string; key: ConsolePageKey; label: string }> = [
  { href: "/", key: "dashboard", label: "Dashboard" },
  { href: "/calendar", key: "calendar", label: "Calendar" },
  { href: "/chores", key: "chores", label: "Chores" },
  { href: "/admin", key: "admin", label: "Admin setup" },
  { href: "/platform-admin", key: "platform", label: "Platform" },
];

export function ConsolePageHeader({
  activePage,
  aside,
  description,
  eyebrow,
  footer,
  title,
}: ConsolePageHeaderProps) {
  return (
    <section className="border-b border-[#cbd5df] bg-[#f8fafc]">
      <div className="mx-auto flex max-w-7xl flex-col gap-4 px-5 py-4 sm:px-8 lg:px-10">
        <nav aria-label="Primary" className="flex flex-wrap items-center gap-x-5 gap-y-2">
          {navItems.map((item) => {
            const isActive = item.key === activePage;

            return (
              <Link
                className={`text-sm font-semibold ${
                  isActive ? "text-[#17202a]" : "text-[#1f6f8b]"
                }`}
                href={item.href}
                key={item.href}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-start">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#2f6f73]">
              {eyebrow}
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-normal sm:text-4xl">{title}</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[#4c5965]">{description}</p>
          </div>
          {aside}
        </div>
        {footer ? <div className="flex flex-wrap items-center gap-3">{footer}</div> : null}
      </div>
    </section>
  );
}
