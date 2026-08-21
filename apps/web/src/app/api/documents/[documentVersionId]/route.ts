import {documentQuery} from "../../../documents/query";
export const dynamic="force-dynamic";
export async function GET(_request:Request,{params}:{params:Promise<{documentVersionId:string}>}){const result=await documentQuery().getMine((await params).documentVersionId);return Response.json(result,{status:503,headers:{"Cache-Control":"private, no-store"}});}
