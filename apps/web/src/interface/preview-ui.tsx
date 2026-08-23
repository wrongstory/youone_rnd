import Link from "next/link";
import type { ReactNode } from "react";

import { previewDataEnabled } from "../composition/preview-mode";
import { formatDisplayText } from "./display-format";

export function PreviewNotice({ compact = false }: { compact?: boolean }) {
  if (!previewDataEnabled()) return null;

  return (
    <aside className="previewNotice" aria-label="데모 데이터 안내">
      <strong>데모 데이터</strong>
      <span>{compact ? "화면 검토용 샘플 · 실제 기록 아님" : "화면 검토용 샘플이며 실제 저장·결재·지급 기록이 아닙니다."}</span>
    </aside>
  );
}

export function PageBackLink({ href = "/", children = "화면 목록" }: { href?: string; children?: ReactNode }) {
  return <Link className="backLink" href={href}>← {children === "화면 목록" ? "대시보드" : children}</Link>;
}

export function RecordGrid({ children }: { children: ReactNode }) {
  return <ul className="recordGrid">{children}</ul>;
}

export function RecordCard({
  href,
  title,
  eyebrow,
  meta,
  children
}: {
  href: string;
  title: string;
  eyebrow: string;
  meta: readonly string[];
  children?: ReactNode;
}) {
  return (
    <li className="recordCard">
      <Link href={href}>
        <span className="recordEyebrow">{eyebrow}</span>
        <strong>{title}</strong>
      </Link>
      <div className="recordMeta" aria-label={`${title} 요약`}>
        {meta.map((item) => <span key={item}>{formatDisplayText(item)}</span>)}
      </div>
      {children}
    </li>
  );
}

export function FactGrid({ facts }: { facts: readonly { label: string; value: ReactNode }[] }) {
  return (
    <dl className="factGrid">
      {facts.map((fact) => (
        <div key={fact.label}>
          <dt>{fact.label}</dt>
          <dd>{typeof fact.value === "string" ? formatDisplayText(fact.value) : fact.value}</dd>
        </div>
      ))}
    </dl>
  );
}
