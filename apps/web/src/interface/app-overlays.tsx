"use client";

import {
  ArrowRight,
  Bell,
  CheckCircle,
  Clock,
  GearSix,
  SignOut,
  UserCircle,
  WarningCircle,
  WifiHigh,
  WifiSlash,
  X
} from "@phosphor-icons/react";
import Link from "next/link";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

const recentNotices = [
  { tone: "success", icon: CheckCircle, title: "연구노트가 최종 확정되었습니다.", meta: "RN-2026-0821 · 오늘 09:42", href: "/research-notes/95000000-0000-4000-8000-000000000002" },
  { tone: "primary", icon: Clock, title: "과업 1건이 검토 대기 상태입니다.", meta: "고효율 배터리 냉각모듈 · 어제 17:30", href: "/projects/b0000000-0000-4000-8000-000000000001" },
  { tone: "warning", icon: WarningCircle, title: "통제사본 회수 예정일이 임박했습니다.", meta: "TC-2026-003 · 어제 15:10", href: "/technical-copies/98000000-0000-4000-8000-000000000002" }
] as const;

function useDismissibleOverlay(open: boolean, close: () => void) {
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        close();
        triggerRef.current?.focus();
      }
    };
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (rootRef.current && !rootRef.current.contains(target) && !panelRef.current?.contains(target)) close();
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [close, open]);

  return { rootRef, panelRef, triggerRef };
}

function PanelHeader({ eyebrow, title, onClose }: { eyebrow: string; title: string; onClose: () => void }) {
  return (
    <header className="overlayPanelHeader">
      <span><small>{eyebrow}</small><strong>{title}</strong></span>
      <button type="button" aria-label={`${title} 닫기`} onClick={onClose}><X aria-hidden size={20} /></button>
    </header>
  );
}

function BodyPortal({ children }: { children: ReactNode }) {
  if (typeof document === "undefined") return null;
  return createPortal(children, document.body);
}

function MobilePortal({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  return enabled ? <BodyPortal>{children}</BodyPortal> : children;
}

export function NotificationCenter({ compact = false }: { compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const close = () => setOpen(false);
  const { rootRef, panelRef, triggerRef } = useDismissibleOverlay(open, close);

  return (
    <div className="overlayAnchor" ref={rootRef}>
      <button ref={triggerRef} className={compact ? "iconButton notificationButton" : "workspaceIconButton"} type="button" aria-label="알림 3건" aria-expanded={open} aria-controls={panelId} onClick={() => setOpen((value) => !value)}>
        <Bell aria-hidden size={compact ? 22 : 21} weight="bold" />
        <span aria-hidden>3</span>
      </button>
      {open ? (
        <MobilePortal enabled={compact}>
          <section ref={panelRef} className="overlayPanel notificationOverlay" id={panelId} role="dialog" aria-label="최근 알림">
            <PanelHeader eyebrow="NOTIFICATION" title="최근 알림" onClose={close} />
            <ul className="overlayNoticeList">
              {recentNotices.map((notice) => {
                const Icon = notice.icon;
                return (
                  <li key={notice.title}>
                    <Link href={notice.href} onClick={close}>
                      <span className={`notificationIcon is-${notice.tone}`}><Icon aria-hidden size={19} weight="fill" /></span>
                      <span><strong>{notice.title}</strong><small>{notice.meta}</small></span>
                    </Link>
                  </li>
                );
              })}
            </ul>
            <Link className="overlayFooterLink" href="/notifications" onClick={close}>전체 알림 기록 보기<ArrowRight aria-hidden size={16} /></Link>
          </section>
        </MobilePortal>
      ) : null}
    </div>
  );
}

export function ProfileCenter({ previewEnabled, compact = false }: { previewEnabled: boolean; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const close = () => setOpen(false);
  const { rootRef, panelRef, triggerRef } = useDismissibleOverlay(open, close);

  return (
    <div className="overlayAnchor" ref={rootRef}>
      <button ref={triggerRef} className={compact ? "profileButton" : "workspaceUser workspaceUserButton"} type="button" aria-expanded={open} aria-controls={panelId} onClick={() => setOpen((value) => !value)}>
        <UserCircle aria-hidden size={compact ? 30 : 30} weight="fill" />
        {compact ? <span className="srOnly">사용자 메뉴</span> : <span><strong>{previewEnabled ? "박현우" : "사용자 확인 중"}</strong><small>{previewEnabled ? "연구소장" : "Identity 연결 대기"}</small></span>}
      </button>
      {open ? (
        <MobilePortal enabled={compact}>
          <section ref={panelRef} className="overlayPanel profileOverlay" id={panelId} role="dialog" aria-label="사용자 메뉴">
            <PanelHeader eyebrow="MY ACCOUNT" title="사용자 메뉴" onClose={close} />
            <div className="profileIdentity">
              <UserCircle aria-hidden size={42} weight="fill" />
              <span><strong>{previewEnabled ? "박현우 연구소장" : "사용자 정보 연결 대기"}</strong><small>{previewEnabled ? "화면 검토용 사용자 · INTERNAL" : "운영 Identity Resolver가 필요합니다."}</small></span>
            </div>
            <Link className="overlayMenuItem" href="/settings/approval" onClick={close}><GearSix aria-hidden size={18} />결재 정책 설정<ArrowRight aria-hidden size={15} /></Link>
            <button className="overlayMenuItem" type="button" disabled><SignOut aria-hidden size={18} />운영 Auth 연결 후 로그아웃</button>
          </section>
        </MobilePortal>
      ) : null}
    </div>
  );
}

export function SyncStatusCenter({ previewEnabled, compact = false }: { previewEnabled: boolean; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const [online, setOnline] = useState(true);
  const panelId = useId();
  const close = () => setOpen(false);
  const { rootRef, panelRef, triggerRef } = useDismissibleOverlay(open, close);

  useEffect(() => {
    const update = () => setOnline(window.navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  const Icon = online ? WifiHigh : WifiSlash;
  return (
    <div className="overlayAnchor" ref={rootRef}>
      <button ref={triggerRef} className={compact ? "drawerConnectivity syncStatusButton" : "workspaceConnectivity syncStatusButton"} type="button" aria-expanded={open} aria-controls={panelId} onClick={() => setOpen((value) => !value)}>
        <Icon aria-hidden size={18} weight="bold" />
        <span><strong>{online ? "온라인 · 동기화 가능" : "오프라인 · 로컬 작업만 가능"}</strong><small>{online ? "보류 작업과 충돌 상태 확인" : "결재·권한 변경은 온라인 전용"}</small></span>
      </button>
      {open ? (
        <MobilePortal enabled={compact}>
          <section ref={panelRef} className="overlayPanel syncOverlay" id={panelId} role="dialog" aria-label="동기화 상태">
            <PanelHeader eyebrow="OFFLINE SYNC" title="동기화 상태" onClose={close} />
            <div className={online ? "syncHealth isOnline" : "syncHealth isOffline"}><Icon aria-hidden size={24} weight="bold" /><span><strong>{online ? "네트워크 연결 정상" : "오프라인 모드"}</strong><small>{online ? "마지막 확인 방금 전" : "온라인 복구 후 수동 검토가 필요합니다."}</small></span></div>
            <dl className="syncFacts">
              <div><dt>전송 대기</dt><dd>{previewEnabled ? "2건" : "확인 대기"}</dd></div>
              <div><dt>충돌 검토</dt><dd>{previewEnabled ? "1건" : "확인 대기"}</dd></div>
              <div><dt>마지막 동기화</dt><dd>{previewEnabled ? "오늘 10:42" : "어댑터 연결 대기"}</dd></div>
            </dl>
            <p className="overlayPolicyNote">충돌 시 서버 또는 로컬 버전을 자동 덮어쓰지 않습니다.</p>
            <Link className="overlayFooterLink" href="/offline-sync" onClick={close}>동기화 작업 화면 열기<ArrowRight aria-hidden size={16} /></Link>
          </section>
        </MobilePortal>
      ) : null}
    </div>
  );
}

export function QuickPreviewButton({ href, title, eyebrow, meta }: { href: string; title: string; eyebrow: string; meta: readonly string[] }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    document.body.classList.add("workPreviewOpen");
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.classList.remove("workPreviewOpen");
    };
  }, [open]);

  return (
    <>
      <button ref={triggerRef} className="quickPreviewButton" type="button" aria-haspopup="dialog" aria-controls={panelId} aria-expanded={open} onClick={() => setOpen(true)}>빠른 보기</button>
      {open ? (
        <BodyPortal>
          <button className="overlayScrim" type="button" aria-label="업무 미리보기 닫기" onClick={() => setOpen(false)} />
          <aside className="workPreviewDrawer" id={panelId} role="dialog" aria-modal="true" aria-labelledby={`${panelId}-title`}>
            <PanelHeader eyebrow="QUICK PREVIEW" title="업무 미리보기" onClose={() => setOpen(false)} />
            <div className="workPreviewBody">
              <span className="workPreviewEyebrow">{eyebrow}</span>
              <h2 id={`${panelId}-title`}>{title}</h2>
              <p>목록에서 확인 가능한 요약 정보입니다. 권한이 필요한 원문이나 민감 필드는 미리보기에 포함하지 않습니다.</p>
              <dl>
                {meta.map((item, index) => <div key={item}><dt>요약 {index + 1}</dt><dd>{item}</dd></div>)}
              </dl>
            </div>
            <footer className="workPreviewFooter"><button type="button" onClick={() => setOpen(false)}>닫기</button><Link href={href}>상세 화면 열기<ArrowRight aria-hidden size={16} /></Link></footer>
          </aside>
        </BodyPortal>
      ) : null}
    </>
  );
}

export function SecureActionPreview({ actionLabel, subjectLabel }: { actionLabel: string; subjectLabel: string }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return (
    <>
      <button ref={triggerRef} className="actionPreviewButton" type="button" aria-haspopup="dialog" onClick={() => setOpen(true)}>동작 화면 미리보기</button>
      {open ? (
        <BodyPortal>
          <button className="overlayScrim modalScrim" type="button" aria-label="확인 창 닫기" onClick={() => setOpen(false)} />
          <section className="actionModal" id={panelId} role="dialog" aria-modal="true" aria-labelledby={`${panelId}-title`}>
            <PanelHeader eyebrow="SECURE ACTION" title="실행 확인" onClose={() => setOpen(false)} />
            <div className="actionModalBody">
              <span className="modalStatusBadge">화면 검토용 · 실행 불가</span>
              <h2 id={`${panelId}-title`}>{actionLabel}</h2>
              <p><strong>{subjectLabel}</strong>에 대한 동작입니다. 실제 실행 시 최신 권한·상태·버전을 다시 검증하고 감사 이벤트를 함께 기록합니다.</p>
              <label><span>처리 의견 또는 사유</span><textarea rows={4} placeholder="실제 명령 어댑터 연결 후 필수 여부가 정책에 따라 적용됩니다." /></label>
            </div>
            <footer className="actionModalFooter"><button type="button" onClick={() => setOpen(false)}>취소</button><button type="button" disabled>운영 인증 후 실행</button></footer>
          </section>
        </BodyPortal>
      ) : null}
    </>
  );
}
