"use client";

import {
  ArrowSquareOut,
  Buildings,
  CaretLeft,
  CaretRight,
  CheckSquare,
  ClipboardText,
  FileText,
  Flask,
  FolderOpen,
  Info,
  LockKey,
  ShieldCheck,
  ShoppingCart,
  Wrench,
  type Icon
} from "@phosphor-icons/react";

const icons = {
  back: CaretLeft,
  next: CaretRight,
  collection: ClipboardText,
  info: Info
} satisfies Record<string, Icon>;

export function PreviewIcon({ name, size = 18 }: { name: keyof typeof icons; size?: number }) {
  const IconComponent = icons[name];
  return <IconComponent aria-hidden size={size} weight={name === "info" ? "fill" : "bold"} />;
}

export function RecordTypeIcon({ href }: { href: string }) {
  let IconComponent: Icon = ArrowSquareOut;
  if (href.startsWith("/approvals")) IconComponent = CheckSquare;
  else if (href.startsWith("/projects")) IconComponent = FolderOpen;
  else if (href.startsWith("/rnd-programs")) IconComponent = Flask;
  else if (href.startsWith("/research-notes") || href.startsWith("/documents")) IconComponent = FileText;
  else if (href.startsWith("/technical-copies")) IconComponent = LockKey;
  else if (href.startsWith("/contracts")) IconComponent = Buildings;
  else if (href.startsWith("/inspections") || href.startsWith("/safety")) IconComponent = ShieldCheck;
  else if (href.startsWith("/non-conformances") || href.startsWith("/engineering-changes")) IconComponent = Wrench;
  else if (href.startsWith("/purchases")) IconComponent = ShoppingCart;

  return <IconComponent aria-hidden size={22} weight="bold" />;
}
