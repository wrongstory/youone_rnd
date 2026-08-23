import { Bell, CheckCircle, Clock, WarningCircle } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";

import { PageBackLink, PreviewNotice } from "../../interface/preview-ui";

const notices = [
  { icon: CheckCircle, tone: "success", title: "연구노트가 최종 확정되었습니다.", meta: "RN-2026-0821 · 오늘 09:42", href: "/research-notes/95000000-0000-4000-8000-000000000002" },
  { icon: Clock, tone: "primary", title: "과업 1건이 검토 대기 상태입니다.", meta: "고효율 배터리 냉각모듈 · 어제 17:30", href: "/projects/b0000000-0000-4000-8000-000000000001" },
  { icon: WarningCircle, tone: "warning", title: "통제사본 회수 예정일이 임박했습니다.", meta: "TC-2026-003 · 어제 15:10", href: "/technical-copies/98000000-0000-4000-8000-000000000002" }
] as const;

export default function NotificationsPage() {
  return (
    <main className="shell">
      <section className="hero" aria-labelledby="notification-title">
        <PageBackLink />
        <p className="eyebrow">NOTIFICATION · MY UPDATES</p>
        <div className="pageTitleRow"><div><h1 id="notification-title">알림</h1><p>결재·프로젝트·통제자료의 최근 변동을 확인합니다.</p></div><Bell aria-hidden size={36} weight="duotone" /></div>
        <PreviewNotice />
        <ul className="notificationList">{notices.map((notice) => { const Icon = notice.icon; return <li key={notice.title}><Link href={notice.href}><span className={`notificationIcon is-${notice.tone}`}><Icon aria-hidden size={22} weight="fill" /></span><span><strong>{notice.title}</strong><small>{notice.meta}</small></span></Link></li>; })}</ul>
      </section>
    </main>
  );
}

