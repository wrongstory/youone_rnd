export type DocumentListResult={availability:"UNAVAILABLE";items:readonly[];reason:"QUERY_ADAPTER_NOT_CONFIGURED"};
export type DocumentDetailResult={availability:"UNAVAILABLE";detail:null;reason:"QUERY_ADAPTER_NOT_CONFIGURED"};
export interface DocumentQueryPort{listMine():Promise<DocumentListResult>;getMine(id:string):Promise<DocumentDetailResult>}
class UnavailableDocumentQuery implements DocumentQueryPort{async listMine():Promise<DocumentListResult>{return{availability:"UNAVAILABLE",items:[],reason:"QUERY_ADAPTER_NOT_CONFIGURED"};}async getMine():Promise<DocumentDetailResult>{return{availability:"UNAVAILABLE",detail:null,reason:"QUERY_ADAPTER_NOT_CONFIGURED"};}}
export function documentQuery():DocumentQueryPort{return new UnavailableDocumentQuery();}
