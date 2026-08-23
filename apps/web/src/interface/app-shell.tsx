"use client";

import {
  Bell,
  Buildings,
  CaretRight,
  CheckSquare,
  ClipboardText,
  FileText,
  Flask,
  FolderOpen,
  GearSix,
  House,
  List,
  LockKey,
  Package,
  ShieldCheck,
  ShoppingCart,
  SignOut,
  Stamp,
  UserCircle,
  WifiHigh,
  Wrench,
  X
} from "@phosphor-icons/react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ComponentType, type ReactNode } from "react";

import { navigationGroups, primaryNavigation } from "./app-navigation";
import { ConnectivityStatus } from "./connectivity-status";

type IconComponent = ComponentType<{ "aria-hidden"?: boolean; size?: number; weight?: "regular" | "fill" | "bold" }>;

const routeIcons: Record<string, IconComponent> = {
  "/": House,
  "/approvals": Stamp,
  "/approvals/submitted": ClipboardText,
  "/approvals/completed": CheckSquare,
  "/settings/approval": GearSix,
  "/projects": FolderOpen,
  "/rnd-programs": Flask,
  "/research-notes": FileText,
  "/documents": FileText,
  "/technical-copies": LockKey,
  "/contracts": Buildings,
  "/inspections": CheckSquare,
  "/non-conformances": ShieldCheck,
  "/engineering-changes": Wrench,
  "/purchases": ShoppingCart,
  "/safety": ShieldCheck,
  "/offline-sync": WifiHigh
};

const navigationItems = navigationGroups.flatMap((group) =>
  group.items.map((item) => ({ ...item, groupLabel: group.label }))
);

function isCurrentPath(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  if (href === "/approvals") return pathname === href || (pathname.startsWith(`${href}/`) && !pathname.startsWith("/approvals/submitted") && !pathname.startsWith("/approvals/completed"));
  return pathname === href || pathname.startsWith(`${href}/`);
}

function ProductBrand({ compact = false }: { compact?: boolean }) {
  return (
    <Link className={compact ? "productBrand productBrandCompact" : "productBrand"} href="/" aria-label="유원 R&D 업무관리 대시보드">
      <Image src="/icons/app-icon.svg" width={compact ? 34 : 40} height={compact ? 34 : 40} alt="" priority />
      <span>
        <strong>유원산업기술</strong>
        <small>R&amp;D 업무관리</small>
      </span>
    </Link>
  );
}

function HierarchicalNavigation({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  return (
    <nav className="hierarchicalNavigation" aria-label="전체 업무 메뉴">
      <Link className={isCurrentPath(pathname, "/") ? "navItem isActive" : "navItem"} href="/" onClick={onNavigate}>
        <House aria-hidden size={20} weight={pathname === "/" ? "fill" : "regular"} />
        <span>대시보드</span>
      </Link>
      {navigationGroups.map((group) => (
        <section className="navGroup" key={group.id} aria-labelledby={`nav-group-${group.id}`}>
          <h2 id={`nav-group-${group.id}`}>{group.label}</h2>
          <ul>
            {group.items.map((item) => {
              const Icon = routeIcons[item.href] ?? Package;
              const active = isCurrentPath(pathname, item.href);
              return (
                <li key={item.href}>
                  <Link className={active ? "navItem isActive" : "navItem"} href={item.href} onClick={onNavigate}>
                    <Icon aria-hidden size={20} weight={active ? "fill" : "regular"} />
                    <span>{item.label}</span>
                    <CaretRight className="navChevron" aria-hidden size={14} />
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </nav>
  );
}

export function AppShell({ children, previewEnabled }: { children: ReactNode; previewEnabled: boolean }) {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const drawerCloseButtonRef = useRef<HTMLButtonElement>(null);
  const activeNavigation = navigationItems.find((item) => isCurrentPath(pathname, item.href));
  const workspaceTitle = pathname === "/" ? "업무 대시보드" : (activeNavigation?.label ?? "R&D 업무관리");
  const workspaceGroup = pathname === "/" ? "내 업무" : (activeNavigation?.groupLabel ?? "업무관리");

  useEffect(() => {
    document.body.classList.toggle("navigationDrawerOpen", drawerOpen);
    return () => document.body.classList.remove("navigationDrawerOpen");
  }, [drawerOpen]);

  useEffect(() => {
    if (!drawerOpen) return;
    drawerCloseButtonRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDrawerOpen(false);
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [drawerOpen]);

  return (
    <div className="appFrame">
      <header className="mobileAppBar">
        <ProductBrand compact />
        <div className="appBarActions">
          <Link className="iconButton notificationButton" href="/notifications" aria-label="알림 3건">
            <Bell aria-hidden size={22} weight="bold" />
            <span aria-hidden>3</span>
          </Link>
          <button className="profileButton" type="button" aria-expanded={profileOpen} aria-controls="mobile-profile-menu" onClick={() => setProfileOpen((value) => !value)}>
            <UserCircle aria-hidden size={30} weight="fill" />
            <span className="srOnly">사용자 메뉴</span>
          </button>
        </div>
        {profileOpen ? (
          <div className="profileMenu" id="mobile-profile-menu">
            <strong>{previewEnabled ? "박현우 연구소장" : "사용자 정보 연결 대기"}</strong>
            <span>{previewEnabled ? "화면 검토용 사용자" : "운영 Identity Resolver가 필요합니다."}</span>
            <Link href="/settings/approval" onClick={() => setProfileOpen(false)}><GearSix aria-hidden size={18} />설정</Link>
            <button type="button" disabled><SignOut aria-hidden size={18} />운영 Auth 연결 후 로그아웃</button>
          </div>
        ) : null}
      </header>

      <aside className="desktopSidebar">
        <ProductBrand />
        <HierarchicalNavigation pathname={pathname} />
        <div className="sidebarAccount">
          <UserCircle aria-hidden size={38} weight="fill" />
          <span><strong>{previewEnabled ? "박현우" : "사용자 확인 중"}</strong><small>{previewEnabled ? "연구소장 · 화면 검토" : "운영 계정 연결 대기"}</small></span>
        </div>
      </aside>

      <div className="workspaceFrame">
        <header className="desktopWorkspaceBar">
          <div className="workspaceContext">
            <span>{workspaceGroup}</span>
            <strong>{workspaceTitle}</strong>
          </div>
          <div className="workspaceUtilities">
            <ConnectivityStatus className="workspaceConnectivity" detail />
            <Link className="workspaceIconButton" href="/notifications" aria-label="알림 3건">
              <Bell aria-hidden size={21} weight="bold" />
              <span aria-hidden>3</span>
            </Link>
            <span className="workspaceUser"><UserCircle aria-hidden size={30} weight="fill" /><span><strong>{previewEnabled ? "박현우" : "사용자 확인 중"}</strong><small>{previewEnabled ? "연구소장" : "Identity 연결 대기"}</small></span></span>
          </div>
        </header>
        <div className="appContent">{children}</div>
      </div>

      <nav className="bottomNavigation" aria-label="주요 메뉴">
        {primaryNavigation.map((item) => {
          const Icon = routeIcons[item.href] ?? Package;
          const active = isCurrentPath(pathname, item.href);
          return (
            <Link className={active ? "bottomNavItem isActive" : "bottomNavItem"} href={item.href} key={item.href}>
              <Icon aria-hidden size={23} weight={active ? "fill" : "regular"} />
              <span>{item.label}</span>
            </Link>
          );
        })}
        <button className={drawerOpen ? "bottomNavItem isActive" : "bottomNavItem"} type="button" aria-expanded={drawerOpen} aria-controls="mobile-navigation-drawer" onClick={() => setDrawerOpen(true)}>
          <List aria-hidden size={23} weight="bold" />
          <span>더보기</span>
        </button>
      </nav>

      {drawerOpen ? <button className="drawerScrim" type="button" aria-label="전체 메뉴 닫기" onClick={() => setDrawerOpen(false)} /> : null}
      {drawerOpen ? (
        <aside className="navigationDrawer isOpen" id="mobile-navigation-drawer" role="dialog" aria-modal="true" aria-label="전체 메뉴">
          <div className="drawerHeader">
            <div><span>전체 메뉴</span><small>업무 영역별 바로가기</small></div>
            <button ref={drawerCloseButtonRef} className="iconButton" type="button" aria-label="전체 메뉴 닫기" onClick={() => setDrawerOpen(false)}><X aria-hidden size={22} /></button>
          </div>
          <HierarchicalNavigation pathname={pathname} onNavigate={() => setDrawerOpen(false)} />
          <Link className="drawerOfflineStatus" href="/offline-sync" onClick={() => setDrawerOpen(false)}>
            <ConnectivityStatus className="drawerConnectivity" detail />
            <CaretRight aria-hidden size={16} />
          </Link>
        </aside>
      ) : null}
    </div>
  );
}
