import { MagnifyingGlass } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";

export default function NotFoundPage() {
  return (
    <main className="shell">
      <section className="hero centeredState">
        <MagnifyingGlass aria-hidden size={44} weight="duotone" />
        <h1>요청한 화면을 찾을 수 없습니다.</h1>
        <p>주소가 변경되었거나 현재 사용자에게 공개되지 않은 경로입니다.</p>
        <Link href="/">대시보드로 이동</Link>
      </section>
    </main>
  );
}
