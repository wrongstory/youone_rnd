import {documentQuery} from "../../documents/query";
export const dynamic="force-dynamic";
export async function GET(){const result=await documentQuery().listMine();return Response.json(result,{status:503,headers:{"Cache-Control":"private, no-store"}});}
