import type { ReactNode } from "react";

type AuthShellProps = {
  eyebrow: string;
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
};

export function AuthShell({ eyebrow, title, subtitle, children, footer }: AuthShellProps) {
  return (
    <main className="page-section">
      <div className="container fade-in" style={{ maxWidth: 480 }}>
        <div style={{ marginBottom: 28 }}>
          <span className="eyebrow">{eyebrow}</span>
          <h1 style={{ fontSize: "clamp(1.8rem, 4vw, 2.2rem)", marginTop: 10 }}>{title}</h1>
          {subtitle ? (
            <p className="text-muted" style={{ marginTop: 10, fontSize: "0.95rem" }}>
              {subtitle}
            </p>
          ) : null}
        </div>

        <div className="surface-card" style={{ padding: 28, display: "flex", flexDirection: "column", gap: 18 }}>
          {children}
        </div>

        {footer ? <div style={{ marginTop: 20, textAlign: "center" }}>{footer}</div> : null}
      </div>
    </main>
  );
}
