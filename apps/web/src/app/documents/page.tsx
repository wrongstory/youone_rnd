import { unavailableDocumentList } from "@youone/ui/public";

import {documentQuery} from "./query";
export const dynamic="force-dynamic";
export default async function DocumentsPage(){const result=await documentQuery().listMine();const view=unavailableDocumentList();return <main className="shell"><section className="hero"><p className="eyebrow">DOCUMENT · SM-DOCUMENT-V1</p><h1>내 문서</h1><div className="status" role="status" data-availability={result.availability}>{view.message}</div><p className="summary">조회 포트가 구성되기 전에는 문서 수나 접근 권한을 추정하지 않습니다. L3/L4 원문 접근은 별도 서버 판정 없이는 제공되지 않습니다.</p></section></main>;}
