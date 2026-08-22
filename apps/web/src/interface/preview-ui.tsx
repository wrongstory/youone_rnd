import Link from "next/link";
import type { ReactNode } from "react";

import { previewDataEnabled } from "../composition/preview-mode";

export function PreviewNotice() {
  if (!previewDataEnabled()) return null;

  return (
    <aside className="previewNotice" aria-label="데모 데이터 안내">
      <strong>데모 데이터</strong>
      <span>화면 검토용 샘플이며 실제 저장·결재·지급 기록이 아닙니다.</span>
    </aside>
  );
}

export function PageBackLink({ href = "/", children = "화면 목록" }: { href?: string; children?: ReactNode }) {
  return <Link className="backLink" href={href}>← {children}</Link>;
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
        {meta.map((item) => <span key={item}>{item}</span>)}
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
          <dd>{fact.value}</dd>
        </div>
      ))}
    </dl>
  );
}

