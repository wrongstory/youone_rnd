import {documentQuery} from "../query";
export const dynamic="force-dynamic";
export default async function DocumentDetailPage({params}:{params:Promise<{documentVersionId:string}>}){const id=(await params).documentVersionId;const result=await documentQuery().getMine(id);return <main className="shell"><section className="hero"><h1>문서 상세</h1><div className="status" role="status" data-availability={result.availability}>문서 상세 조회 서비스 연결 전</div><p className="summary">가짜 내용·파일 링크·실행 가능한 버튼을 표시하지 않습니다.</p></section></main>;}
