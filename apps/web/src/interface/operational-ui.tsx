import Link from "next/link";
import type { ReactNode } from "react";

import { PreviewIcon } from "./preview-icons";

export function OperationalPageHeader({
  eyebrow,
  title,
  description,
  actions
}: {
  eyebrow: string;
  title: string;
  description: string;
  actions?: ReactNode;
}) {
  return (
    <header className="operationalPageHeader">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {actions ? <div className="pageActionRail">{actions}</div> : null}
    </header>
  );
}

export function BackendContractNotice({ children }: { children?: ReactNode }) {
  return (
    <aside className="backendContractNotice" role="status">
      <PreviewIcon name="info" />
      <span>
        <strong>Frontend 계약 미리보기</strong>
        {children ?? "Backend #58 연결 전이며 입력값은 저장되거나 인증 요청으로 전송되지 않습니다."}
      </span>
    </aside>
  );
}

const settingLinks = [
  { href: "/settings/users", label: "사용자" },
  { href: "/settings/vendors", label: "외주 계정" },
  { href: "/settings/organization", label: "조직·직책" },
  { href: "/settings/access", label: "역할·권한" },
  { href: "/settings/security", label: "세션·MFA" },
  { href: "/settings/audit", label: "감사 로그" }
] as const;

export function SettingsSectionNavigation({ current }: { current: string }) {
  return (
    <nav className="sectionTabs" aria-label="시스템 관리 메뉴">
      {settingLinks.map((item) => <Link className={current === item.href ? "isActive" : undefined} href={item.href} key={item.href}>{item.label}</Link>)}
    </nav>
  );
}

const projectWorkspaceLinks = [
  { segment: "", label: "개요" },
  { segment: "/wbs", label: "WBS" },
  { segment: "/members", label: "구성원" },
  { segment: "/links", label: "제품·R&D 연결" },
  { segment: "/documents", label: "문서·결재" },
  { segment: "/history", label: "변경 이력" },
  { segment: "/settings", label: "설정" }
] as const;

export function ProjectWorkspaceNavigation({ projectId, current }: { projectId: string; current: string }) {
  return (
    <nav className="sectionTabs projectWorkspaceTabs" aria-label="프로젝트 작업공간">
      {projectWorkspaceLinks.map((item) => {
        const href = `/projects/${projectId}${item.segment}`;
        return <Link className={current === item.segment ? "isActive" : undefined} href={href} key={href}>{item.label}</Link>;
      })}
    </nav>
  );
}

export function OperationalStateBadge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "success" | "warning" | "danger" }) {
  return <span className="operationalStateBadge" data-tone={tone}>{children}</span>;
}

export function EmptyOperationalState({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return (
    <div className="operationalEmptyState">
      <PreviewIcon name="collection" size={28} />
      <h2>{title}</h2>
      <p>{description}</p>
      {action}
    </div>
  );
}

